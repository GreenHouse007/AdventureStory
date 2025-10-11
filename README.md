# 🌒 Shadow Paths — A Full-Stack Interactive Storytelling Platform

Shadow Paths is a portfolio-grade, MERN-inspired choose-your-own-adventure engine that blends a Twine-style authoring experience with a production-ready player portal. Built with Node.js, Express, MongoDB, and rich client-side motion, it lets players dive into branching tales while creators craft elaborate storylines backed by real-time persistence and cloud integrations.

---

## 🧭 Platform Overview

### Player Experience
- **Firebase Authentication** with email/password, Google sign-in, password resets, and email verification.
- **Progression Tracking** that records endings found, medals earned, and stories created or published per account.
- **Trophies & Dual Currencies** featuring Gems and Author Gems for unlocking premium story branches.
- **Unlockable Paths** that gate secret nodes or finales behind earned currency requirements.

### Creator Tools
- **Node Story Builder** delivering a Twine-style grid editor for branching narratives.
- **Cloudinary-Powered Media** uploads for cover art, scene imagery, and atmospheric assets.
- **Real-Time MongoDB Saving** so story drafts, node changes, and metadata persist instantly.

### Admin Tools
- **User & Library Management** dashboards for moderating accounts and curating story libraries.
- **Content Oversight** to approve community stories and surface featured adventures.
- **Resend-Powered Inbox** for handling contact forms, support escalations, and platform updates.

---

## 🛠️ Tech Stack

| Layer          | Technology                                                |
| -------------- | --------------------------------------------------------- |
| **Frontend**   | EJS • HTML • CSS • JavaScript                              |
| **Backend**    | Node.js • Express                                         |
| **Database**   | MongoDB + Mongoose                                        |
| **Auth**       | Firebase Auth • bcrypt • express-session                   |
| **Cloud Storage** | Cloudinary                                             |
| **Email**      | Resend API                                                |
| **Hosting**    | Render.com                                                |
| **Dev Tools**  | Nodemon • dotenv • GitHub CI/CD                           |
| **AI**         | OpenAI Codex                                              |

---

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/GreenHouse007/AdventureStory.git
   cd AdventureStory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the project root with the following keys:
   ```env
   MONGODB_URI=<your-mongodb-connection-string>
   SESSION_SECRET=<random-session-secret>
   CLOUDINARY_CLOUD_NAME=<cloudinary-cloud-name>
   CLOUDINARY_API_KEY=<cloudinary-api-key>
   CLOUDINARY_API_SECRET=<cloudinary-api-secret>
   RESEND_API_KEY=<resend-api-key>
   FIREBASE_PROJECT_ID=<firebase-project-id>
   FIREBASE_CLIENT_EMAIL=<firebase-service-account-client-email>
   FIREBASE_PRIVATE_KEY="<firebase-service-account-private-key>"
   FIREBASE_API_KEY=<firebase-web-api-key>
   FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
   FIREBASE_STORAGE_BUCKET=<firebase-storage-bucket>
   FIREBASE_MESSAGING_SENDER_ID=<firebase-messaging-sender-id>
   FIREBASE_APP_ID=<firebase-app-id>
   FIREBASE_MEASUREMENT_ID=<firebase-measurement-id>
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```
   The app boots with nodemon, hot-reloading server changes and serving the latest assets.

---

## 🗺️ Roadmap
- Trophy progression refinements with rarity tiers and seasonal challenges.
- Expanded currency unlocks for branching finales and author monetization.
- Immersive audio narration and adaptive ambient soundscapes.
- Collectible badges and profile showcases for completions.
- REST/GraphQL API for importing and exporting story blueprints.
- Competitive leaderboards tracking speed-runs, endings, and creative output.

---

## 💡 Developer Notes

Shadow Paths has grown from a simple choose-your-own-adventure prototype into a feature-rich storytelling engine that fuses database persistence, cloud media management, email automation, and Firebase-authenticated sessions. Iterative enhancements—many assisted by OpenAI Codex—have layered in responsive UI, cinematic motion, and professional tooling to produce a platform ready for production use or collaborative expansion.
