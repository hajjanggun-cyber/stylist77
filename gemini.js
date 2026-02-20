import dotenv from 'dotenv';
import OpenAI from 'openai';
import readline from 'readline';

dotenv.config();

const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error('API Key not found in .env file!');
    process.exit(1);
}

const openai = new OpenAI({ apiKey });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("GPT CLI (OpenAI) - Type 'exit' to quit.");

function ask() {
    rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
            rl.close();
            return;
        }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: input }],
            });

            console.log(response.choices[0].message.content);
        } catch (error) {
            console.error('Error:', error.message);
        }

        ask();
    });
}

ask();
