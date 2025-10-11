// controllers/site.controller.js

const RESEND_API_URL = "https://api.resend.com/emails";

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

  const from = process.env.CONTACT_FROM || "no-reply@shadowpaths.app";
  const to = process.env.CONTACT_TO || process.env.RESEND_TO || from;

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

  // --- Primary: Resend API ---
  if (process.env.RESEND_API_KEY) {
    try {
      const resp = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from,
          to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          reply_to: [`"${safe.name}" <${safe.email}>`],
        }),
      });

      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(
          `Resend HTTP ${resp.status}${detail ? `: ${detail}` : ""}`
        );
      }

      return res.render("public/contact", {
        title: "Contact",
        user: req.user,
        status: { ok: true, msg: "Thanks! Your message was sent." },
        form: { name: "", email: "", subject: "", message: "" },
      });
    } catch (err) {
      console.error("[Contact] Resend failed:", err?.message || err);
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
