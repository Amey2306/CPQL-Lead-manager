import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeCallRecording(audioBase64: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType
              }
            },
            {
              text: `Analyze this sales call recording. Provide a JSON response with the following structure:
{
  "summary": "A brief summary of the call",
  "painPoints": ["Point 1", "Point 2"],
  "priority": "High" | "Medium" | "Low",
  "suggestedScore": 85, // A number from 0 to 100 based on conversion likelihood
  "keyTakeaways": "Main takeaways for the sales manager"
}
Ensure the response is valid JSON without markdown formatting.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing call recording:", error);
    throw error;
  }
}

export async function analyzeCallRecordingUrl(url: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analyze this sales call recording from the following URL: ${url}
              
Provide a JSON response with the following structure:
{
  "summary": "A brief summary of the call",
  "painPoints": ["Point 1", "Point 2"],
  "priority": "High" | "Medium" | "Low",
  "suggestedScore": 85, // A number from 0 to 100 based on conversion likelihood
  "keyTakeaways": "Main takeaways for the sales manager"
}
Ensure the response is valid JSON without markdown formatting.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing call recording URL:", error);
    throw error;
  }
}
