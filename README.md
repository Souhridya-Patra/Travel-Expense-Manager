# 🏕️ Trip Expense Manager

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)
> A simple, intuitive application to track group expenses, split bills, and calculate settlements during trips. No more messy spreadsheets or arguments over who owes whom!

## 📖 Table of Contents
- [About the Project](#about-the-project)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)
- [Contact](#contact)

---

## 🚀 About the Project

When traveling with friends or family, keeping track of who paid for what can quickly become a headache. **Trip Expense Manager** solves this by allowing users to add members, log expenses, and instantly calculate the most efficient way to settle up at the end of the journey. It also supports **food expenses** where each person pays only for their own order.

### Screenshots
> Add screenshots or a short demo GIF here.

---

## ✨ Key Features

* **Trip Setup:** Add the total number of travelers and rename them easily.
* **Log Expenses:** Record who paid, amount, and expense type.
* **Food Orders:** Track individual food orders with validation (orders must match the bill).
* **Equal Split for Regular Expenses:** Automatically split shared costs across all travelers.
* **Optimized Settlements:** Calculate who owes whom with a clean settlement summary.
* **Clear Totals:** See regular vs food totals and per-person share for regular expenses.

---

## 🛠️ Tech Stack

**Frontend:**
* React + TypeScript
* Vite
* Tailwind CSS
* lucide-react icons

**Backend:**
* None (client-only app)

**Database:**
* None (in-memory state for now)

---

## 💻 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Make sure you have the following installed:
* Node.js 18+ (or newer)
* npm

### Installation

1. **Clone the repository:**
	```bash
	git clone https://github.com/Souhridya-Patra/Trip_Expense_Manager.git
	```

2. **Install dependencies:**
	```bash
	npm install
	```

3. **Run the app locally:**
	```bash
	npm run dev
	```

Then open the local URL shown in the terminal.

---

## 🧭 Usage

1. Enter the total number of travelers.
2. Add and rename participants.
3. Add expenses:
	- **Regular:** split equally among all travelers.
	- **Food:** enter each person's order amount (must match the bill total).
4. Click **Calculate Settlements** to see who owes whom.

---

## 🤝 Contributing

Contributions are welcome! If you want to improve the app, please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to your fork: `git push origin feature/my-feature`
5. Open a Pull Request

Please keep PRs focused and include a short description of the change.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for guidelines.

---

## 🗺️ Roadmap

**Innovative idea:** **Receipt Scan + Auto-Split**
- Add a lightweight OCR flow so users can snap a receipt and auto-fill expenses.
- Detect line items and suggest who ordered what based on names or quick tags.
- This reduces manual data entry and makes the app feel like a real travel companion.

Other ideas:
- Save trips locally (localStorage) so sessions persist.
- Export settlements as CSV or shareable text.
- Add currency selector and exchange rate handling.

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

---

## 📬 Contact

If you have suggestions or questions, feel free to open an issue on GitHub.
