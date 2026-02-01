# 🏛️ JanNivaran - Citizen Grievance Redressal Portal

**JanNivaran** (Public Resolution) is a next-generation grievance redressal system designed to bridge the gap between citizens and administration. It provides a transparent, efficient, and AI-powered platform for filing, tracking, and resolving public complaints.

![JanNivaran Dashboard Preview](https://via.placeholder.com/800x400?text=JanNivaran+Dashboard+Preview)

## 🌟 Key Features

### 👤 For Citizens
-   **Easy Complaint Filing**: Intuitive form with photo evidence upload.
-   **Real-time Tracking**: Visual timeline of complaint progress (Pending → Under Review → In Progress → Resolved).
-   **SLA Monitoring**: See transparent deadlines. If a complaint is overdue, it's visually flagged.
-   **AI Support Chat**: 24/7 AI assistant to guide you through the process.
-   **Instant Feedback**: "Rate Service" option upon resolution to ensure accountability.
-   **Control**: Ability to delete or withdraw complaints.

### 👮‍♂️ For Officials & Admins
-   **Unified Dashboard**: High-level stats on Total, Pending, and Breached complaints.
-   **Automated Workflow**: Status updates to "Under Review" automatically when viewed.
-   **Simulation Engine**: Tools to simulate time passage (`+1 Hour`) and force SLA breaches to test escalation protocols.
-   **Role-Based Access**:
    -   *Officials*: Update status, mark in-progress.
    -   *Authority*: Exclusive rights to **Resolve** or **Delete** complaints.
-   **Smart Notifications**: Automated emails with timestamps for every status change.

### 🤖 Tech Stack
-   **Frontend**: Next.js 14, React, Tailwind CSS (Noble Dark/Forest Theme).
-   **Backend**: Next.js API Routes, Firebase Admin SDK.
-   **Database**: Google Firestore (NoSQL).
-   **Authentication**: Firebase Auth.
-   **Email Service**: Nodemailer (SMTP).
-   **State Management**: React Context API.

## 🚀 Getting Started

### Prerequisites
-   Node.js 18+
-   Firebase Project (Firestore & Auth enabled)
-   SMTP Server Credentials (e.g., Gmail App Password)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/OMgaupale1024/JANIVARAN.git
    cd JANIVARAN
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env.local` file in the root directory:
    ```env
    # Firebase Client
    NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

    # Firebase Admin
    FIREBASE_PROJECT_ID=your_project_id
    FIREBASE_CLIENT_EMAIL=your_service_account_email
    FIREBASE_PRIVATE_KEY="your_private_key_with_newlines"

    # Email Service
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_app_password
    NEXT_PUBLIC_APP_URL=http://localhost:3000
    ```

4.  **Run the development server**
    ```bash
    npm run dev
    ```

5.  **Open the App**
    Visit [http://localhost:3000](http://localhost:3000) for the Citizen Portal.
    Visit [http://localhost:3000/admin](http://localhost:3000/admin) for the Admin Dashboard.

## 📸 Screenshots

| Citizen Dashboard | Admin Stats |
| ----------------- | ----------- |
| *(Add Screenshot)* | *(Add Screenshot)* |

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

### 📞 Support
For urgent issues or feature requests:
*   **Phone**: 9322088956
*   **Email**: ogaupale@gmail.com
