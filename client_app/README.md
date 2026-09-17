# VeriCorpus AI Client

> Modern React frontend for VeriCorpus AI – AI-powered Semantic Plagiarism Detection Platform

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

---

# Overview

The **VeriCorpus AI Client** is the frontend application for the VeriCorpus AI platform. It provides an intuitive interface for semantic plagiarism detection, Retrieval-Augmented Generation (RAG), document management, and report visualization by communicating with the FastAPI backend.

Built with **React**, **TypeScript**, and **Vite**, the application focuses on performance, scalability, and a responsive user experience.

---

# Features

- Secure user authentication
- Dashboard with plagiarism statistics
- Upload and manage documents
- Semantic plagiarism analysis interface
- RAG-powered document query interface
- Interactive similarity reports
- Corpus API integration
- Responsive UI for desktop and mobile
- Modern component-based architecture

---

# Project Structure

```text
client_app/
│
├── public/
├── src/
│   ├── api/
│   ├── assets/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── plagiarism/
│   │   ├── rag/
│   │   ├── reports/
│   │   └── upload/
│   ├── hooks/
│   ├── layouts/
│   ├── pages/
│   ├── services/
│   ├── store/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

# Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | React 19 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| State Management | Zustand |
| API Communication | Fetch API / Axios |
| Forms | React Hook Form |
| Validation | Zod |
| Charts | Recharts |
| PDF Viewer | react-pdf |
| Linting | Oxlint + ESLint + Prettier |

---

# Prerequisites

- Node.js 20+
- npm
- Running VeriCorpus AI Backend

---

# Installation

Clone the repository

```bash
git clone https://code.swecha.org/saharsha1/client_app.git

cd client_app
```

Install dependencies

```bash
npm install
```

---

# Environment Variables

Create a `.env` file in the project root.

```env
VITE_API_BASE_URL=http://localhost:8000
```

Update the API URL according to your backend deployment.

---

# Running the Application

Start the development server

```bash
npm run dev
```

Open

```
http://localhost:5173
```

---

# Production Build

Build the application

```bash
npm run build
```

Preview the production build

```bash
npm run preview
```

---

# Available Scripts

| Command | Description |
|---------|-------------|
| npm run dev | Start development server |
| npm run build | Create production build |
| npm run preview | Preview production build |
| npm run lint | Run linter |
| npm run format | Format code (if configured) |

---

# Backend Integration

The frontend communicates with the VeriCorpus AI backend through REST APIs.

The backend should be running before starting the frontend.

Configure the backend URL using

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Database migrations

The backend schema is managed with Alembic. Apply migrations from the
repository root before starting a production backend:

```bash
cd client_app
backend/.venv/bin/alembic -c alembic.ini upgrade head
```

Use `-x sqlalchemy.url=...` for an explicit database URL during local or CI
runs. Development startup may still create missing tables when `DEBUG=true`;
production deployments must run migrations explicitly.

## DeepShield-X Integration

The backend can combine the continuous text-learning model with the multimodal DeepShield-X pipelines from [Deepfake_detection_model](https://github.com/Saharshasamala1112/Deepfake_detection_model). Set these variables in `backend/.env` after cloning that repository and placing its trained checkpoint in `models/best_model.pth`:

```env
DEEPSHIELD_ROOT=/absolute/path/to/Deepfake_detection_model
DEEPSHIELD_MODEL_PATH=/absolute/path/to/Deepfake_detection_model/models/best_model.pth
DEEPSHIELD_ENABLED=true
```

DeepShield-X supplies real/fake forensic signals, confidence, frame/audio metadata, Grad-CAM, and reconstruction artifacts. The VeriCorpus continuous text model remains a separate AI-writing signal for documents and pasted text. The language selector localizes the user-facing explanation; model scores remain technical evidence.

---

# Screenshots

Add application screenshots here.

```text
docs/
├── login.png
├── dashboard.png
├── upload.png
├── plagiarism.png
├── reports.png
```

---

# Future Improvements

- Dark mode support
- Accessibility improvements
- Internationalization (i18n)
- Progressive Web App support
- Offline document viewing
- Enhanced analytics dashboard

---

# Development

Install dependencies

```bash
npm install
```

Run linting

```bash
npm run lint
```

Build

```bash
npm run build
```

---

# Contributing

1. Fork the repository

2. Create a feature branch

```bash
git checkout -b feature/new-feature
```

3. Commit your changes

```bash
git commit -m "Add new feature"
```

4. Push your branch

```bash
git push origin feature/new-feature
```

5. Open a Merge Request

---

# License

This project is licensed under the MIT License.

---

# Author

**Saharsha Samala**

GitLab: https://code.swecha.org/saharsha1

---

# Acknowledgements

- React
- TypeScript
- Vite
- Tailwind CSS
- FastAPI
- Swecha
- Open Source Community