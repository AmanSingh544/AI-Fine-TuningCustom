const cheerio = require("cheerio");
const axios = require("axios");
const fs = require("fs");
const OpenAI = require("openai");
require("dotenv").config();

const config = {
    urls: [
        {
            url: "https://www.mtechzilla.com/",
            contentType: "general",
        },
        // {
        //     url: "https://www.mtechzilla.com/company/about-us",
        //     contentType: "about",
        // },
        // {
        //     url: "https://www.mtechzilla.com/services",
        //     contentType: "services",
        // },
    ],
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-5",
        trainingExamples: 50,
    },
    outputFile: "training_data.jsonl",
};

class AIScrapper {
    constructor(config) {
        this.urls = config.urls;
        this.openaiConfig = config.openai;
        this.outputFile = config.outputFile;
        this.scrappedContent = [];
        this.trainingData = [];
        this.openai = new OpenAI({
            apiKey: this.openaiConfig.apiKey,
        });
        this.totalCost = 0;
    }

    async fetchPage(url) {
        try {
            const response = await axios.get(url, {
                timeout: 300000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AI-Training-Data-Scraper/1.0)'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error(`Failed to fetch ${url}: ${error.message}`);
            return null;
        }
    }

    extractContent(html, urlConfig) {
        const $ = cheerio.load(html);
        $('script, style, nav, header, footer').remove();
        $('[class*="cookie"], [class*="popup"], [class*="ad"]').remove();
        $('button, .btn').remove();

        const headings = [];
        $('h1, h2, h3, h4').each((_, ele) => {
            const text = $(ele).text().trim();
            if (text.length > 3 && text.length < 200) {
                headings.push(text);
            }
        });

        const paragraphs = [];
        $('p').each((_, ele) => {
            const text = $(ele).text().trim();
            if (text.length > 3 && text.length < 200) {
                paragraphs.push(text);
            }
        });

        const listItems = [];
        $('ul, li, ol , li').each((_, ele) => {
            const text = $(ele).text().trim();
            if (text.length > 3 && text.length < 200) {
                listItems.push(text);
            }
        });

        return {
            url: urlConfig.url,
            contentType: urlConfig.contentType,
            title: $('title').text().trim(),
            metaDescription: $('meta[name="description"]').attr('content') || "",
            headings: headings.slice(0, 10),
            paragraphs: paragraphs.slice(0, 15),
            listItems: listItems.slice(0, 20)
        };
    }

    formatContentForPrompt(content) {
        let formattedContent = `URL: ${content.url}\n`;
        formattedContent += `Content Type: ${content.contentType}\n`;
        formattedContent += `Title: ${content.title}\n`;

        if (content.metaDescription) {
            formattedContent += `Description: ${content.metaDescription}\n`;
        }

        if (content.headings.length) {
            formattedContent += `Headings: \n${content.headings.map(h => `- ${h}`).join('\n')}\n\n`;
        }

        if (content.paragraphs.length) {
            formattedContent += `Content: \n${content.paragraphs.join('\n\n')}\n\n`;
        }

        if (content.listItems.length) {
            formattedContent += `Features/Services: \n${content.listItems.map(item => `- ${item}`).join('\n')}\n\n`;
        }

        return formattedContent;
    }

    async generateTrainingDataWithAI() {
        const allContent = this.scrappedContent.map(cnt => this.formatContentForPrompt(cnt)).join('\n' + '='.repeat(50) + '\n');
        const prompt = `Based on the website content below, generate ${this.openaiConfig.trainingExamples} diverse, natural Q&A pairs for training service chatbot.
        Website Content:
        ${allContent}
        Create varied questions a real customer might ask,, including:
        - Company/business information
        - Services or products offered
        - Contact and support questions
        - General greetings and conversational questions
        - FAQ-style questions

        Make questions natural and human-like. Generate accurate answers based ONLY on the provided website content. Keep answers concise but informative.
        Return a JSON object with a "training_data" array containing the Q&A pairs.
        `;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.openaiConfig.model,
                messages: [
                    {
                        role: "system",
                        content: "You are an expert at creating training data for AI chatbots. Always return valid JSON. Output your final JSON response directly withput any reasoning or explanation.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    }
                ],
                response_format: {
                    type: "json_object",
                    json_schema: {
                        name: "training_data_generation",
                        schema: {
                            type: "object",
                            properties: {
                                training_data: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            question: {
                                                type: "string",
                                                description: "A natural question a customer might ask"
                                            },
                                            answer: {
                                                type: "string",
                                                description: "An accurate answer based on the website content"
                                            }
                                        },
                                        required: ["question", "answer"]
                                    }
                                }
                            },
                            required: ["training_data"]
                        }
                    }
                }
            });

            const generatedContent = response.choices[0].mesage.content?.trim();
            const actualInputTokens = response.usage.prompt_tokens;
            const actualOutputTokens = response.usage.completion_tokens;
            const actualCost = (actualInputTokens * 1.25 / 100000) + (actualOutputTokens * 10 / 100000);
            this.totalCost += actualCost;

            if (!generatedContent) {
                throw new Error("No content generated in response.");
            }

            const structuredData = JSON.parse(generatedContent);
            const validTrainingData = [];

            if (structuredData.trainingData && Array.isArray(structuredData.trainingData)) {
                structuredData.trainingData.forEach(item => {
                    if (item.question && item.answer) {
                        validTrainingData.push({
                            messages: [
                                {
                                    role: "system",
                                    content: "You are a helpful assistant. Answer questions accurately based on the website content."
                                },
                                {
                                    role: "user",
                                    content: item.question
                                },
                                {
                                    role: "assistant",
                                    content: item.answer
                                }
                            ],
                        });
                    }
                });
            }

            this.trainingData = validTrainingData;
            console.log(`Generated ${validTrainingData.length} training examples`);

        }
        catch (error) {
            console.error(`Open API error: ${error.message}`);
            throw error;
        }
    }

    async scrape() {
        console.log(`Starting scrapper for ${this.urls.length} URLs`);

        for (const urlConfig of this.urls) {
            const html = await this.fetchPage(urlConfig.url);

            if (html) {
                const content = this.extractContent(html, urlConfig);
                this.scrappedContent.push(content);
                console.log(`Scrapped: ${content.title} - from ${urlConfig.url}`);
            }

            await new Promise(res => setTimeout(res, 1000));
        }

        if (this.scrappedContent.length === 0) {
            throw new Error("No content scrapped from any URL.");
        }

        await this.generateTrainingDataWithAI();
        console.log(`Scraped ${this.scrapedContent.length} pages, generated ${this.trainingData.length} examples`);
        console.log(`Total cost: $${this.totalCost.toFixed(4)}`);
    }

    saveToFile() {
        if (this.trainingData.length === 0) {
            console.error("No training data to save.");
            return;
        }

        const jsonl = this.trainingData.map(ex => JSON.stringify(ex)).jsoin('\n');

        fs.writeFileSync(this.outputFile, jsonl, 'utf-8');
        console.log(`Saved ${this.trainingData.length} examples training data to ${this.outputFile}`);
    }
}

async function main() {
    try {
        if (!config.openai.apiKey) {
            console.error("Please set OpenAI API key in .env file");
            return;
        }

        const scrapper = new AIScrapper(config);
        await scrapper.scrape();
        scrapper.saveToFile();

        console.log("Scrapping completed successfully.");
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
    }
}


main();