# NestJS REST API Boilerplate (Prisma + PostgreSQL) 🚀

[![NestJS](https://img.shields.io/badge/NestJS-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-39827B?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Swagger](https://img.shields.io/badge/Swagger-%23Clojure?style=for-the-badge&logo=swagger&logoColor=white)](https://swagger.io/)
[![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-%23F7B93E.svg?style=for-the-badge&logo=prettier&logoColor=black)](https://prettier.io/)
[![Jest](https://img.shields.io/badge/Jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![AWS S3](https://img.shields.io/badge/AWS_S3-%23FF9900.svg?style=for-the-badge&logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)

A highly-optimized, production-ready NestJS REST API boilerplate designed for scalability, absolute type-safety, and an exceptional developer experience.

This boilerplate has been modernized to run exclusively on **Prisma ORM** and **PostgreSQL**, eliminating legacy ORM overhead while offering a solid architectural foundation.

---

## Architectural Scaffold & Directory Layout

The project follows a domain-driven, repository-pattern architecture designed to separate concerns between business logic and database persistence:

```text
src/
├── auth/                         # Authentication domain (JWT, Refresh tokens, SSO)
├── config/                       # Strongly-typed configuration system
├── database/                     # Core database module (PrismaService, migrations)
├── files/                        # File upload infrastructure (S3 / Local drivers)
├── home/                         # Basic health check and welcome routing
├── mail/                         # Mail handling templates and logic
├── mailer/                       # Under-the-hood mailing service wrapper
├── roles/                        # User Roles module and RBAC guards
├── session/                      # Active user sessions management
├── statuses/                     # Account status configurations (Active/Inactive)
├── users/                        # Core User domain
└── utils/                        # Shared utility types, validators, and helpers
```

### Persistence Layer Architecture
Each major domain features an isolated infrastructure persistence directory structure:
```text
infrastructure/persistence/
├── relational/
│   ├── mappers/                  # Maps Prisma models to domain entities and vice-versa
│   ├── repositories/             # Concrete Prisma repository implementations
│   └── relational-persistence.module.ts
└── user.repository.ts            # Abstract repository interface defining domain contract
```
This guarantees that services depend on abstract contracts (`UserRepository`), allowing implementation details to change without impacting core business logic.

---

## Key Features

- [x] **Database Engine:** Optimized [Prisma Client](https://www.prisma.io/) query processing with PostgreSQL.
- [x] **Strict Domain Isolation:** Business models decoupled from persistence representations via Prisma Mappers.
- [x] **Advanced Authentication:** Secure JWT-based Auth flows containing automatic access-refresh token rotations.
- [x] **Social Sign-In (SSO):** Plug-and-play integrations for Apple, Google, and Facebook sign-in.
- [x] **Strong Configurations:** Environment configuration validated at runtime using `class-validator` and `dotenv`.
- [x] **Modular Upload Driver:** Supports both local and AWS S3 storage drivers out of the box.
- [x] **Mail Integration:** Handled via Nodemailer, using Handlebars templates for activation and password reset emails.
- [x] **API Documentation:** Interactive [Swagger/OpenAPI Docs](https://swagger.io/) automatically built.
- [x] **Seeding Engine:** Custom seed logic to automatically construct roles, statuses, and admin assets.
- [x] **Containerized Setup:** Fully configured local development environment via `docker-compose`.

---

## Getting Started

### 1. Requirements
Ensure you have the following installed on your machine:
- [Node.js (v20+)](https://nodejs.org/)
- [Docker](https://www.docker.com/)

### 2. Environment Setup
Copy the sample database and mail environment parameters:
```bash
cp env-example-relational .env
```
Ensure database credentials inside `.env` match your configuration requirements.

### 3. Spin up Infrastructure
Run database and local mail testing servers in docker background:
```bash
docker compose up postgres maildev -d
```

### 4. Database Setup
Instantiate your migrations, generate the Prisma Client, and seed default roles:
```bash
npm install
npm run prisma:migrate
npm run prisma:seed
```

### 5. Running the Application
Launch the dev server with hot-reload enabled:
```bash
npm run start:dev
```
- **REST API:** `http://localhost:3001/api`
- **Swagger Documentation:** `http://localhost:3001/docs`
- **Local Mail Viewer (Maildev):** `http://localhost:1080`

---

## Command Reference

| Command | Action |
|---------|--------|
| `npm run build` | Compiles the NestJS project into distribution-ready JavaScript. |
| `npm run start:dev` | Runs the API in watch/development mode. |
| `npm run prisma:migrate` | Runs dev database migration sync. |
| `npm run prisma:seed` | Seeds default database Roles and Status entries. |
| `npm run prisma:studio` | Launches visual Prisma Studio DB panel locally. |
| `npm run test:e2e` | Runs Jest E2E automated test suites. |
| `npm run format` | Runs Prettier format fix on codebase. |

---

## Support

For inquiries, support, or further configuration advice, feel free to open a ticket or raise a question in the repository discussions list.
