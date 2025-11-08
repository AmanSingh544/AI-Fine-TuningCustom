const OpenAI = require("openai");
const fs = require("fs");
require("dotenv").config();

const CONFIG = {
    // Choose your base model for fine-tuning
    MODEL: "gpt-4.1-nano-2025-04-14",

    // Training file path
    TRAINING_FILE: "fine_tune_data.jsonl",

    // Polling interval for job status (in milliseconds)
    POLL_INTERVAL: 30000, // 30 seconds
};

class FineTuningManager {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not set in environment variables.");
        }

        this.openai = new OpenAI({
            apikey: process.env.OPENAI_API_KEY,
            organization: process.env.OPENAI_ORG_ID || undefined,
        });
    }

    // Step 1: Validate training data format
    validateTrainingData() {
        console.log("Validating training data format...");

        if (!fs.existsSync(CONFIG.TRAINING_FILE)) {
            throw new Error(`Training file ${CONFIG.TRAINING_FILE} does not exist.`);
        }

        const content = fs.readFileSync(CONFIG.TRAINING_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.lenght < 10) {
            throw new Error("Training data must contain at least 10 examples. Found: " + lines.length);
        }

        let validExamples = 0;
        lines.forEach((line, index) => {
            try {
                const data = JSON.parse(line);

                // validate JSONL structure as per OpenAI documentation
                if (!data.messages || !Array.isArray(data.messages) || data.messages.length < 2) {
                    throw new Error(`Invalid message structure at line ${index + 1}`);
                }

                // check for required roles
                const hasUser = data.messages.some(m => m.role === 'user');
                const hasAssistant = data.messages.some(m => m.role === 'assistant');

                if (!hasUser || !hasAssistant) {
                    throw new Error(`Both 'user' and 'assistant' roles must be present at line ${index + 1}`);
                }

                validExamples++;
            }
            catch (err) {
                console.warn(`⚠️ Skipping line ${index + 1}: ${e.message}`);
            }
        });

        if (validExamples < 10) {
            throw new Error(`At least 10 valid examples are required. Found: ${validExamples}`);
        }

        console.log(`✅ Training data validation passed with ${validExamples} valid examples.`);
        return validExamples;
    }

    // Step 2 : Upload training file to OpenAI
    async uploadTrainingFile() {
        console.log("Uploading training file to OpenAI...");

        const file = await this.openai.files.create({
            file: fs.createReadStream(CONFIG.TRAINING_FILE),
            pupose: 'fine-tune',
        });
        console.log(`✅ Training file uploaded. File ID: ${file.id}`);
        return file.id;

    }

    // Step 3: Create fine-tuning job
    async createFineTuningJob(fileId) {
        console.log(`Createing fine-tuning job with model ${CONFIG.MODEL}...`);

        const job = await this.openai.fineTuning.jobs.create({
            training_file: fileId,
            model: CONFIG.MODEL,
            method: {
                type: "supervised",
            }
        });

        console.log(`✅ Fine-tuning job created. Job ID: ${job.id}`);
        return job.id;
    }

    // Step 4: Monitor job until completion
    async monitorJob(jobId) {
        console.log(`Monitoring fine-tuning job ${jobId}...`);
        console.log("This may takes 10-30 minutes depending on the dataset size and model.");

        while (true) {
            const job = await this.openai.fineTuning.jobs.retrieve(jobId);

            console.log(`Status: ${job.status}`);

            if (job.status === 'succeeded') {
                console.log(`✅ Fine-tuning completed. Fine-tuned model: ${job.fine_tuned_model}`);
                return job.fine_tuned_model;
            }

            if (job.status === 'failed') {
                throw new Error(`❌ Fine-tuning job failed: ${job.error?.message}`);
            }

            if (job.status === 'cancelled') {
                throw new Error(`❌ Fine-tuning job was cancelled.`);
            }

            // wait before checking again
            await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
        }
    }

    // Complete supervised fine-tuning workflow
    async runFineTuning() {
        try {
            console.log("Starting supervised fine-tuning process...");
            console.log(`Using model: ${CONFIG.MODEL}`);
            console.log(`Training file: ${CONFIG.TRAINING_FILE} \n`);
            console.log(`======================================== \n`);

            // Step 1: Validate Data
            const validExamples = this.validateTrainingData();

            // Step 2: Upload Training File
            const fileId = await this.uploadTrainingFile();


            // Step 3: Create Fine-Tuning Job
            const jobId = await this.createFineTuningJob(fileId);

            // Step 4: Monitor Job Completion
            const modelId = await this.monitorJob(jobId);

            console.log("\n" + "=".repeat(60));
            console.log("SUCCESS! Your file-tuned model is ready!");
            console.log("=".repeat(60));

            console.log(`\n Model ID: ${modelId}`);
            console.log(`Trained on ${validExamples} examples.`);
            console.log("\n Next Steps:");

            console.log(`1. Copy the model ID above.`);
            console.log(`2. Use it in your applications to access your custom model`);

            return modelId;
        }
        catch (err) {
            console.error(`\n Error during fine-tuning: ${err.message}`);

            if (err.message.includes("not found")) {
                console.log("💡 Tip: Make sure training_data.jsonl exists in the current directory");
            }
            else if (err.message.includes("API key")) {
                console.log("💡 Tip: Ensure your OPENAI_API_KEY is set correctly in the .env file");
            }

            throw err;
        }
    }
}


// Main execution
async function main() {
    const manager = new FineTuningManager();
    await manager.runFineTuning();
}

if (require.main === module) {
    main().catch(err => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
}

module.exports = FineTuningManager;