import express from 'express';
import cors from 'cors';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate, ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import 'dotenv/config';

const app = express();
app.use(cors({origin: 'https://aai-project-three.vercel.app'}));
app.use(express.json());

// Helper to prevent hitting rate limits during the sequential pipeline
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", // Kept on 1.5-flash for stable free-tier usage
  apiKey: process.env.GOOGLE_API_KEY,
  maxRetries: 3,
});

// 1. The Product Manager Agent
const pmPrompt = PromptTemplate.fromTemplate(
  "You are a Senior Product Manager. Create a detailed technical specification for this idea: {input}. " +
  "Include a Feature List, Tech Stack (prefer MERN), and a Database Schema."
);

// 2. The Developer Agent
const devPrompt = PromptTemplate.fromTemplate(
  "You are a Senior Full-stack Developer. Write the functional code implementation based on this specification: {input}. " +
  "Focus on readability and modern JavaScript/Node.js syntax. " +
  "CRITICAL INSTRUCTION: For EVERY file you write, you MUST provide the exact filename on its own line immediately before the markdown code block. " +
  "Example:\n`server.js`\n```javascript\nconsole.log('hello');\n```"
);

// 3. The Security Agent 
const securityPrompt = PromptTemplate.fromTemplate(
  "You are a Cybersecurity Expert. Audit this code for vulnerabilities: {input}. " +
  "Check for SQL injection, XSS, and hardcoded secrets. If you find issues, explicitly list them."
);

app.post('/generate', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = (agent, chunk, iteration = 1) => {
    res.write(`data: ${JSON.stringify({ agent, chunk, iteration })}\n\n`);
  };

  try {
    const { idea } = req.body;

    // --- STEP 1: PM AGENT ---
    let fullSpec = "";
    const pmStream = await pmPrompt.pipe(llm).pipe(new StringOutputParser()).stream({ input: idea });
    for await (const chunk of pmStream) { 
      fullSpec += chunk; 
      sendUpdate('pm', chunk); 
    }

    await sleep(1000);

    // --- STEP 2: DEV AGENT (Iteration 1) ---
    let firstCode = "";
    const devStream = await devPrompt.pipe(llm).pipe(new StringOutputParser()).stream({ input: fullSpec });
    for await (const chunk of devStream) { 
      firstCode += chunk; 
      sendUpdate('dev', chunk, 1); 
    }

    await sleep(1000);

    // --- STEP 3: SECURITY AGENT ---
    let audit = "";
    const secStream = await securityPrompt.pipe(llm).pipe(new StringOutputParser()).stream({ input: firstCode });
    for await (const chunk of secStream) { 
      audit += chunk; 
      sendUpdate('sec', chunk); 
    }

    await sleep(1000);

    // --- STEP 4: THE FEEDBACK LOOP ---
    const feedbackPrompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a Senior Developer fixing security vulnerabilities. CRITICAL INSTRUCTION: For EVERY file you write, you MUST provide the exact filename on its own line immediately before the markdown code block. Example:\n`server.js`\n```javascript\nconsole.log('hello');\n```"],
      ["user", `Original Spec: {spec}\n\nYour Previous Code: {oldCode}\n\nSecurity Audit Feedback: {audit}\n\nPlease rewrite the necessary code to fix the security vulnerabilities.`]
    ]);

    const retryStream = await feedbackPrompt.pipe(llm).pipe(new StringOutputParser()).stream({ 
      spec: fullSpec, 
      oldCode: firstCode, 
      audit: audit 
    });

    for await (const chunk of retryStream) { 
      sendUpdate('dev', chunk, 2); 
    }

    res.end();
  } catch (error) { 
    console.error(error);
    res.write(`data: ${JSON.stringify({ agent: 'sec', chunk: "\n\n**Pipeline Error.** Try again.", iteration: 1 })}\n\n`);
    res.end(); 
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
