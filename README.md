# Bank App v2 Backend 

[![Quality Gate Status](https://mthatcher109.ngrok.io/api/project_badges/measure?project=bankappv2backend&metric=alert_status&token=sqb_6e42dd25db9bb9407a5ce65907ecd5d9c076be45)](https://mthatcher109.ngrok.io/dashboard?id=bankappv2backend) [![Coverage](https://mthatcher109.ngrok.io/api/project_badges/measure?project=bankappv2backend&metric=coverage&token=sqb_6e42dd25db9bb9407a5ce65907ecd5d9c076be45)](https://mthatcher109.ngrok.io/dashboard?id=bankappv2backend)[![Security Hotspots](https://mthatcher109.ngrok.io/api/project_badges/measure?project=bankappv2backend&metric=security_hotspots&token=sqb_6e42dd25db9bb9407a5ce65907ecd5d9c076be45)](https://mthatcher109.ngrok.io/dashboard?id=bankappv2backend)

[Front End Repository](https://github.com/MAThatcher/bank-app-v2-frontend)

This is the backend service for the Bank App v2, a banking application that provides features such as user authentication, account management, transactions, and email notifications. The backend is built using Node.js, Express, and PostgreSQL.

---

### Features

1. ##### User Authentication:

    * Register, login, and email verification.
    * JWT-based authentication with access and refresh tokens.
    
2. ##### Account Management:

    * Create, update, and delete bank accounts.
    
3. ##### Transactions:

    * Perform and track transactions between accounts.
    
4. ##### Email Notifications:

    * Email verification and password reset functionality using Nodemailer.
    
5. ##### Error Handling:

    * Graceful error handling with proper HTTP status codes.
    
6. ##### Test Coverage:

    * Unit and integration tests using Mocha, Chai, and Sinon.

---

### Technologies Used

1. Node.js: Backend runtime.
2. Express: Web framework for building RESTful APIs.
3. PostgreSQL: Database for storing user and account data.
4. Nodemailer: Email service for notifications.
5. JWT: JSON Web Tokens for authentication.
6. Mocha, Chai, Sinon: Testing framework and libraries.

---

### Setup Instructions

#### Prerequisites
* Node.js (v16 or higher)
* PostgreSQL
* A Gmail account for email notifications (or another SMTP service)

#### Installation

1. Clone the repository: `git clone https://github.com/your-username/bank-app-v2-backend.git`
2. Install dependencies: `npm install`
3. Set up the .env file:
    * Create a .env file in the root directory and add the following environment variables:
    *      
            JWT_KEY="your_jwt_secret"
            JWT_REFRESH_SECRET="your_refresh_secret"
            EMAIL_USER="your_email@example.com"
            EMAIL_PASS="your_email_password"
            CLIENT_URL="http://localhost:3000"
5. Set up the database:
    1. Create a PostgreSQL database.
    2. Update the database connection settings in db.js:
         * ```
           const pool = new Pool({
                user: "your_db_user",
                host: "localhost",
                database: "your_db_name",
                password: "your_db_password",
                port: 5432,
                });
    4. Run DataBase_init.sql on your database

---

### Running the Application

Development
Start the development server:
`npm run dev`

Production
Start the production server:
`npm start`

Testing
Run Tests
Execute the test suite: `npm test`

Generate Test Coverage
Generate a test coverage report: `npm run coverage`

The coverage report will be available in the coverage directory.

### API Endpoints

##### Authentication

* POST /api/users/register: Register a new user.
* POST /api/users/login: Login and receive access/refresh tokens.
* GET /api/users/verify-email/:token: Verify a user's email.

##### Accounts

* GET /api/accounts: Get all accounts for a user.
* POST /api/accounts: Create a new account.
* DELETE /api/accounts/:id: Delete an account.
  
##### Transactions

* POST /api/transactions: Perform a transaction between accounts.

##### Notifications

* POST /api/notifications/send: Send a notification email.
  
### Project Structure

```
bank-app-v2-backend/
├── routes/               # API route handlers
├── services/             # Business logic and utilities
├── test/                 # Unit and integration tests
├── db.js                 # Database connection
├── server.js             # Application entry point
├── .env                  # Environment variables
├── package.json          # Project metadata and dependencies
└── README.md             # Project documentation
```