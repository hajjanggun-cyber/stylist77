import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import readline from 'readline';

dotenv.config();

// Gemini API 키 로드 (기존 키가 없다면 수동 입력 필요할 수 있음)
const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('Gemini API Key가 .env 파일에 없습니다! (VITE_GEMINI_API_KEY 또는 GEMINI_API_KEY)');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const chat = model.startChat({
    history: [],
});

console.log("Gemini 2.0 CLI - 'exit'을 입력하면 종료됩니다.");

async function ask() {
    rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        try {
            const result = await chat.sendMessage(input);
            const response = await result.response;
            const text = response.text();
            console.log(text);
        } catch (error) {
            console.error('Error:', error.message);
        }

        ask();
    });
}

ask();
