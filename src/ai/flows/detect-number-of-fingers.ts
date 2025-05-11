'use server';

/**
 * @fileOverview Detects the number of fingers being held up in an image.
 *
 * - detectNumberOfFingers - A function that handles the finger detection process.
 * - DetectNumberOfFingersInput - The input type for the detectNumberOfFingers function.
 * - DetectNumberOfFingersOutput - The return type for the detectNumberOfFingers function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectNumberOfFingersInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      'A photo of a hand with fingers, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' 
    ),
});
export type DetectNumberOfFingersInput = z.infer<typeof DetectNumberOfFingersInputSchema>;

const DetectNumberOfFingersOutputSchema = z.object({
  numberOfFingers: z.number().describe('The number of fingers being held up.'),
});
export type DetectNumberOfFingersOutput = z.infer<typeof DetectNumberOfFingersOutputSchema>;

export async function detectNumberOfFingers(input: DetectNumberOfFingersInput): Promise<DetectNumberOfFingersOutput> {
  return detectNumberOfFingersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectNumberOfFingersPrompt',
  input: {schema: DetectNumberOfFingersInputSchema},
  output: {schema: DetectNumberOfFingersOutputSchema},
  prompt: `You are an expert in image recognition, specializing in identifying the number of fingers being held up in a hand.

  Analyze the image provided and determine the number of fingers that are visibly extended.

  Respond with a single number representing the count of the fingers.

  Image: {{media url=photoDataUri}}`,
});

const detectNumberOfFingersFlow = ai.defineFlow(
  {
    name: 'detectNumberOfFingersFlow',
    inputSchema: DetectNumberOfFingersInputSchema,
    outputSchema: DetectNumberOfFingersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
