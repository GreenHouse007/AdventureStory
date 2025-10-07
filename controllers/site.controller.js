// controllers/site.controller.js
const nodemailer = require("nodemailer");

// ---------- SMTP (Gmail) over 587 ----------
function buildSmtpTransport() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587); // STARTTLS
  const secure = String(process.env.SMTP_SECURE || "false") === "true"; // keep false for 587

  return nodemailer.createTransport({
    host,
    port,
    secure, // false for 587
    requireTLS: !secure, // ensures STARTTLS for 587
    auth: {
      user: process.env.SMTP_USER, // Gmail that created the App Password
      pass: process.env.SMTP_PASS, // 16-char App Password (no spaces)
    },
    // Harden timeouts + prefer IPv4 + SNI
    family: 4,
    tls: { servername: host, minVersion: "TLSv1.2" },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

exports.contactForm = (req, res) => {
  res.render("public/contact", {
    title: "Contact",
    user: req.user,
    status: null,
    form: { name: "", email: "", subject: "", message: "" },
  });
};

exports.contactSubmit = async (req, res) => {
  const {
    name = "",
    email = "",
    subject = "",
    message = "",
    hp = "",
  } = req.body || {};

  // Honeypot for bots
  if (hp && hp.trim() !== "") {
    return res.render("public/contact", {
      title: "Contact",
      user: req.user,
      status: { ok: true, msg: "Thanks! If this was real, we received it." },
      form: { name: "", email: "", subject: "", message: "" },
    });
  }

  // Validate + sanitize
  const errors = [];
  const safe = {
    name: String(name).trim().slice(0, 100),
    email: String(email).trim().slice(0, 150),
    subject: String(subject).trim().slice(0, 140),
    message: String(message).trim().slice(0, 5000),
  };
  if (!safe.name) errors.push("Please enter your name.");
  if (!safe.email || !/.+@.+\..+/.test(safe.email))
    errors.push("Please enter a valid email.");
  if (!safe.subject) errors.push("Please enter a subject.");
  if (!safe.message) errors.push("Please enter a message.");

  if (errors.length) {
    return res.render("public/contact", {
      title: "Contact",
      user: req.user,
      status: { ok: false, errors },
      form: safe,
    });
  }

  const to = process.env.CONTACT_TO || process.env.SMTP_USER;
  const from =
    process.env.CONTACT_FROM ||
    process.env.SMTP_USER ||
    "no-reply@shadowpaths.app";

  const mail = {
    subject: `[Shadow Paths] ${safe.subject}`,
    text: `From: ${safe.name} <${safe.email}>\nSubject: ${safe.subject}\n\n${safe.message}`,
    html:
      `<p><strong>From:</strong> ${escapeHtml(safe.name)} &lt;${escapeHtml(
        safe.email
      )}&gt;</p>` +
      `<p><strong>Subject:</strong> ${escapeHtml(safe.subject)}</p>` +
      `<hr><p style="white-space:pre-wrap">${escapeHtml(safe.message)}</p>`,
  };

  // --- Try SMTP first if creds exist ---
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = buildSmtpTransport();
      await transporter.verify(); // can connect/auth?
      await transporter.sendMail({
        to,
        from,
        replyTo: `"${safe.name}" <${safe.email}>`,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      return res.render("public/contact", {
        title: "Contact",
        user: req.user,
        status: { ok: true, msg: "Thanks! Your message was sent." },
        form: { name: "", email: "", subject: "", message: "" },
      });
    } catch (err) {
      console.error("[Contact] SMTP failed:", err?.code || err?.message || err);
      // fall through to Apps Script if configured
    }
  }

  // --- Fallback: Google Apps Script HTTPS relay (free) ---
  // Set GSCRIPT_WEBAPP_URL + GSCRIPT_TOKEN in .env to enable this.
  if (process.env.GSCRIPT_WEBAPP_URL && process.env.GSCRIPT_TOKEN) {
    try {
      const resp = await fetch(process.env.GSCRIPT_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: process.env.GSCRIPT_TOKEN,
          name: safe.name,
          email: safe.email,
          subject: safe.subject,
          message: safe.message,
        }),
      });
      if (!resp.ok) throw new Error("Apps Script HTTP " + resp.status);

      return res.render("public/contact", {
        title: "Contact",
        user: req.user,
        status: { ok: true, msg: "Thanks! Your message was sent." },
        form: { name: "", email: "", subject: "", message: "" },
      });
    } catch (err) {
      console.error("[Contact] Apps Script failed:", err?.message || err);
    }
  }

  // Final graceful failure
  console.warn("[Contact] No mail transport succeeded; logging message.");
  console.log({
    name: safe.name,
    email: safe.email,
    subject: safe.subject,
    message: safe.message,
  });

  return res.render("public/contact", {
    title: "Contact",
    user: req.user,
    status: {
      ok: false,
      errors: [
        "We couldn’t send your message right now. Please try again later.",
      ],
    },
    form: safe,
  });
};
