# 🌒 Shadow Paths — A Choose Your Own Adventure Platform

**Shadow Paths** is a web-based interactive storytelling platform inspired by _D&D_, _dark fantasy_, and _spooky adventure tales_.  
Players can create accounts, explore branching stories, and unlock multiple endings — while their progress, stats, and discoveries are saved automatically.  
Admins can manage users, upload story images, and build stories with flexible node-based structures.

🔗 **Live Demo:** [https://adventurestory.onrender.com/](https://adventurestory.onrender.com/)

---

## ✨ Features

### 🧍 Player Experience

- **User Accounts**

  - Sign up, log in, and log out securely
  - Session persistence using Express Sessions + MongoDB
  - Profile stats showing total endings, medals, and story progress

- **Story Library**

  - Browse all available stories with cover art and descriptions
  - Stories display discovered vs total endings
  - Automatically offers **“Continue where you left off”** if a player hasn’t finished
  - **“Start from Beginning”** appears only once a story is completed or reset
  - Stories maintain admin-defined display order

- **Game Progression**
  - Stories feature multiple endings (true, death, secret, etc.)
  - In-game currency awarded for completing endings and earning medals
  - Tracks total endings, medals, and story completion across all adventures

---

### ⚙️ Admin Tools

- **Story Management**

  - Create and edit story entries and branching nodes
  - Add, reorder, and delete story images
  - Integrated **Cloudinary** upload system (secure `.env` keys)
  - Story library reflects admin-defined display order

- **User Management**
  - View all users and toggle admin status
  - See user progress and endings completed

---

## 🧩 Tech Stack

| Layer             | Technology                               |
| ----------------- | ---------------------------------------- |
| **Frontend**      | EJS templating • HTML • CSS              |
| **Backend**       | Node.js • Express                        |
| **Database**      | MongoDB • Mongoose                       |
| **Auth**          | express-session • connect-mongo • bcrypt |
| **Cloud Storage** | Cloudinary (image hosting + management)  |
| **Dev Tools**     | nodemon • dotenv • seed scripts          |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account (for image hosting)

### Installation

```bash
git clone https://github.com/yourusername/shadow-paths.git
cd shadow-paths
npm install

```

## 🧠 Roadmap

Player progress reset option

Visual branching editor for story nodes

Achievements and collectible badges

Audio narration and ambient sound system

Premium story unlocks using earned currency

API for importing/exporting stories
