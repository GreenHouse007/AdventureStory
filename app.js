const express = require("express");
const path = require("path");
const routes = require("./routes");
const { getReturnPath } = require("./utils/navigation");

require("dotenv").config();
const connectDB = require("./db");

const session = require("express-session");
const MongoStore = require("connect-mongo");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// serve static files (css, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

// connect to database
connectDB();

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/cyoaDB",
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      secure: false, // set true if behind HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);
const { attachUser } = require("./middleware/auth");
app.use(attachUser); // make user available in req.user and EJS

// in app.js (after your auth middleware sets req.user)
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

// mount all routes
app.use("/", routes);

// 404 + error handler (no route matched)
app.use((req, res) => {
  res.status(404).render("public/404", {
    title: "Not Found",
    user: req.user,
    backLink: getReturnPath(req),
  });
});

// 500 (error handler must have 4 params)
app.use((err, req, res, next) => {
  console.error(err); // log it (swap for a logger in prod)
  const showDetails = process.env.NODE_ENV !== "production";
  res.status(500).render("public/500", {
    title: "Server Error",
    message: showDetails ? err.message : "Something went wrong.",
    user: req.user,
    backLink: getReturnPath(req),
  });
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
