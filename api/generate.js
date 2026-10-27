import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import process from "node:process";

const corsMiddleware = cors({ preflightContinue: true });

export default async function handler(req, res) {

    await new Promise((resolve, reject) => {
        corsMiddleware(req, res, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed.",
        });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing.");

            return res.status(500).json({
                error: "Server API key is not configured.",
            });
        }

        const {
            pageName,
            desktopImage,
            mobileImage,
        } = req.body || {};

        if (!pageName?.trim()) {
            return res.status(400).json({
                error: "Page name is required.",
            });
        }

        if (!desktopImage?.data || !desktopImage?.mime_type) {
            return res.status(400).json({
                error: "Desktop image is required.",
            });
        }

        const ai = new GoogleGenAI({
            apiKey,
        });

        const input = [];

        // Desktop image
        input.push({
            type: "image",
            data: desktopImage.data,
            mime_type: desktopImage.mime_type,
        });

        // Mobile image
        if (mobileImage?.data && mobileImage?.mime_type) {
            input.push({
                type: "image",
                data: mobileImage.data,
                mime_type: mobileImage.mime_type,
            });
        }

        //Prompt
        input.push({
            type: "text",
            text: `
            You are an expert React frontend developer.
            Analyze the uploaded website design image(s).
            Convert the design into a functional React JSX component.
            The component name must be: ${pageName}

            Requirements:
            1. Return ONLY the complete JSX code.
            2. Do NOT use markdown code fences.
            3. Do NOT provide explanations.
            4. Do NOT put anything before or after the JSX.
            5. Recreate the uploaded design as accurately as possible.
            6. Analyze carefully:
                - page structure
                - layout
                - spacing
                - margins
                - padding
                - typography
                - font sizes
                - font weights
                - colors
                - backgrounds
                - borders
                - border radius
                - shadows
                - buttons
                - cards
                - images
                - alignment
                - widths
                - heights
            7. If a desktop and mobile design are provided, use both designs to determine responsive behavior.
            8. The component must be responsive.
            9. Use standard React JSX.
            10. Use inline styles or CSS classes.
            11. Do not use external UI libraries.
            12. Do not use Tailwind unless absolutely necessary.
            13. The component must be directly usable in a React application.
            14. Component name must be exactly: ${pageName}

            Return ONLY the JSX component.`,
        });

        // Gemini Interactions API
        console.log(
            "Calling Gemini model: gemini-3.6-flash"
        );

        const interaction = await ai.interactions.create({
            model: "gemini-3.6-flash",
            input,
        });

        // Read response
        let code = interaction.output_text;

        if (!code) {
            throw new Error(
                "Gemini returned an empty response."
            );
        }

        // Remove Markdown code fences if present
        code = code
            .replace(/^```(?:jsx|javascript|react)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        console.log(
            "Gemini JSX generation completed."
        );

        return res.status(200).json({
            success: true,
            code,
        });
    } catch (error) {
        console.error(
            "Gemini API error:",
            error?.status || "",
            error?.message || "Unknown error"
        );

        const status = Number(error?.status) || 500;

        return res.status(status).json({
            error: status === 429
                ? "Gemini quota reached. Please try again later."
                : "Gemini generation failed. Check the backend logs.",
        });
    }
}
