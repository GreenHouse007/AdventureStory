# Shadow Paths — A Choose Your Own Adventure Platform

Shadow Paths is a web-based storytelling platform inspired by D&D and spooky fantasy vibes.  
Players create accounts, read interactive branching stories, unlock endings, and track their progress.  
Admins can manage users and create/edit stories.

---

## ✨ Features

- **User Accounts**

  - Sign up, log in, log out
  - Profile stats and awards
  - Persistent session authentication (Express Session + MongoDB)

- **Story Library**

  - Browse available stories
  - Each story shows total endings, endings found by the player
  - Auto-save progress (coming soon)

- **Player Stats**

  - Tracks total endings found across all stories
  - Awards medals for milestones (death endings, true endings)
  - Tracks earned in-game currency

- **Admin Dashboard**

  - Overview of users and stories
  - Manage user roles (toggle admin)
  - View seeded stories (create/edit coming soon)

- **Game Progression**
  - Stories contain multiple endings: true ending, death endings, and others
  - In-game currency awarded for unlocking endings and medals
  - Special “epic moments” unlockable with currency (planned)

---

## 🛠️ Tech Stack

- **Frontend:** EJS templating, HTML, CSS
- **Backend:** Node.js + Express
- **Database:** MongoDB + Mongoose
- **Auth:** express-session + connect-mongo, bcrypt for password hashing
- **Other Tools:** nodemon for dev, dotenv for config, seeding script

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Install

```bash
git clone https://github.com/yourusername/shadow-paths.git
cd shadow-paths
npm install
```
