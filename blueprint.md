# Personal Stylist Service (Aura)

## Overview

This application, "Aura," provides professional personal styling recommendations using the **Gemini 3.1 Pro** AI model. It analyzes user-provided photos, height, and weight to deliver detailed body type analysis, fashion advice, and hairstyle suggestions.

## Features

### Core Analysis (v1.5 - Gemini 3.1 Pro Upgrade)

*   **Advanced AI Analysis:** High-fidelity body type analysis and styling report using `gemini-3.1-pro-preview`.
*   **Multi-Modal Input:** Supports image upload and physical metrics (height/weight).
*   **Hairstyle Generation:** AI-generated hairstyle suggestions based on the user's facial features.
*   **Localization:** Full support for English and Korean.
*   **Payment Integration:** Secure checkout and automated refund handling via Polar.sh.
*   **Modern UI:** Premium "Aura" design with glassmorphism and sticky navigation.

### New Features (Planned/Implemented)

*   **Chat with Stylist:** Real-time follow-up chat to ask specific questions about the styling report.
*   **Enhanced Security:** Robust API key management and server-side validation.
*   **Result Persistence:** Save and share analysis results as high-quality images.

## Plan

1.  **Migrate Backend to Gemini 3.1 Pro:** Refactor `functions/api/analyze.ts` to use Google's Gemini API instead of OpenAI.
2.  **Implement Style Chat Feature:** Add a chat interface to the results page to allow interactive follow-ups.
3.  **Refine UI & Aesthetics:** Ensure consistent "Aura" styling across all new components.
4.  **Automated Testing:** Add tests for the core analysis flow and API integrations.
