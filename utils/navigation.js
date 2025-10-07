const buildSafeRefererPath = (req) => {
  const referer = req.get("Referer") || req.get("Referrer");
  if (!referer) {
    return null;
  }

  try {
    const host = req.get("host");
    if (!host) {
      return null;
    }

    const base = `${req.protocol}://${host}`;
    const url = new URL(referer, base);

    if (url.origin !== base) {
      return null;
    }

    const path = `${url.pathname}${url.search}`;

    if (!path.startsWith("/")) {
      return null;
    }

    if (path === req.originalUrl) {
      return null;
    }

    return path;
  } catch (error) {
    return null;
  }
};

exports.getReturnPath = (req) => {
  const fromReferer = buildSafeRefererPath(req);
  if (fromReferer) {
    return fromReferer;
  }

  return req.user ? "/u/library" : "/";
};
