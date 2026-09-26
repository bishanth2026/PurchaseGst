import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware to parse large JSON payloads (invoices as base64)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Indian GST OCR Extraction Endpoint
app.post('/api/ocr-extract', async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64) {
      return res.status(400).json({
        success: false,
        errorType: 'MISSING_PAYLOAD',
        error: 'Invoice document data (fileBase64) is required',
      });
    }

    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    
    // Infer MIME type accurately from extension if missing or generic
    const ext = (fileName ? fileName.split('.').pop() || '' : '').toLowerCase();
    let actualMimeType = mimeType;
    if (!actualMimeType || actualMimeType === 'application/octet-stream') {
      if (ext === 'pdf') actualMimeType = 'application/pdf';
      else if (ext === 'png') actualMimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') actualMimeType = 'image/jpeg';
      else if (ext === 'webp') actualMimeType = 'image/webp';
      else if (ext === 'svg') actualMimeType = 'image/svg+xml';
      else actualMimeType = 'image/jpeg';
    }

    const supportedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
      'image/heic',
      'image/heif',
    ];

    if (!supportedMimeTypes.includes(actualMimeType) || ['zip', 'rar', 'tar', 'gz', '7z', 'exe', 'bin'].includes(ext)) {
      return res.status(400).json({
        success: false,
        errorType: 'UNSUPPORTED_DOCUMENT',
        error: `Document format (${actualMimeType || ext || 'unknown'}) is not supported. Please upload a clear PDF, PNG, or JPG invoice document.`,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[OCR Backend] GEMINI_API_KEY is not configured on the server.');
      }
      return res.status(503).json({
        success: false,
        errorType: 'MISSING_API_KEY',
        error: 'Gemini API key is not configured on the server. Please attach a valid API key in the AI Studio environment.',
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OCR Backend] Request received: file=${fileName || 'unknown'}, mime=${actualMimeType}, base64Len=${cleanBase64.length}`);
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `You are a certified Indian Chartered Accountant and automated GST invoice OCR engine for 'Biznexco'.
Analyze the provided purchase invoice / tax document image or PDF and extract precise GST data.

CRITICAL INSTRUCTIONS:
1. NEVER invent, guess, or hallucinate missing information.
2. If any field (e.g. HSN code, cess, tax rate) is illegible, absent, or ambiguous, return null or empty string, assign a low confidence score (< 0.5), and append an explicit note in "warnings".
3. Validate that supplier GSTIN is a 15-character string. Check state code prefix (e.g. 27 for Maharashtra, 29 for Karnataka, 24 for Gujarat, 07 for Delhi).
4. Identify documentType as 'INV' (Tax Invoice), 'CRN' (Credit Note), or 'DBN' (Debit Note).
5. For each field, provide a confidence score between 0.00 and 1.00.
6. Extract individual line items with description, HSN/SAC, quantity, unit, unitRate, taxableValue, gstRate, cgstAmount, sgstAmount, igstAmount, cessAmount, and totalAmount.

Respond STRICTLY with valid JSON matching this exact schema:
{
  "supplierName": string,
  "supplierGstin": string,
  "supplierAddress": string,
  "buyerGstin": string,
  "invoiceNumber": string,
  "invoiceDate": "YYYY-MM-DD",
  "documentType": "INV" | "CRN" | "DBN",
  "placeOfSupply": "2-digit state code",
  "taxableValue": number,
  "cgstAmount": number,
  "sgstAmount": number,
  "igstAmount": number,
  "cessAmount": number,
  "totalAmount": number,
  "hsnSac": string,
  "lineItems": [
    {
      "description": string,
      "hsnSac": string,
      "quantity": number,
      "unit": string,
      "unitRate": number,
      "taxableValue": number,
      "gstRate": number,
      "cgstAmount": number,
      "sgstAmount": number,
      "igstAmount": number,
      "cessAmount": number,
      "totalAmount": number,
      "confidence": number
    }
  ],
  "confidenceScores": {
    "supplierName": number,
    "supplierGstin": number,
    "invoiceNumber": number,
    "invoiceDate": number,
    "documentType": number,
    "taxableValue": number,
    "cgstAmount": number,
    "sgstAmount": number,
    "igstAmount": number,
    "cessAmount": number,
    "totalAmount": number,
    "hsnSac": number
  },
  "warnings": string[]
}`;

    // Prepare contents payload:
    // For SVG vector documents, pass as XML text so the LLM parses the exact text structure without failing image codecs.
    const isSvg = actualMimeType === 'image/svg+xml' || ext === 'svg';
    const contents: any[] = [{ text: prompt }];

    if (isSvg) {
      let svgText = '';
      try {
        svgText = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      } catch {
        svgText = cleanBase64;
      }
      contents.push({
        text: `INVOICE DOCUMENT SOURCE (SVG Vector Text Data):\n\`\`\`xml\n${svgText}\n\`\`\``,
      });
    } else {
      contents.push({
        inlineData: {
          mimeType: actualMimeType,
          data: cleanBase64,
        },
      });
    }

    // Candidate models in preference order:
    // gemini-3.1-flash-lite is high-speed and reliable for multimodal OCR;
    // gemini-3.8-flash is the primary flagship text/multimodal model.
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: any = null;
    let responseText = '';
    let successfulModel = '';

    for (const model of candidateModels) {
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[OCR Backend] Calling Gemini model: ${model}`);
        }
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        if (response && response.text) {
          responseText = response.text;
          successfulModel = model;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[OCR Backend] Model ${model} encountered an issue:`, err?.message || err);
      }
    }

    if (!responseText) {
      const errStr = lastError?.message || String(lastError || 'Unknown model error');
      console.error('[OCR Backend] All candidate models failed:', errStr);

      let errorType = 'GEMINI_API_ERROR';
      let statusCode = 500;
      let userFriendlyMessage = 'Failed to extract invoice data using Gemini AI.';

      if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE')) {
        errorType = 'MODEL_HIGH_DEMAND';
        statusCode = 503;
        userFriendlyMessage = 'Gemini AI models are temporarily experiencing high demand. Please try uploading the document again in a few moments.';
      } else if (errStr.includes('429') || errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')) {
        errorType = 'RATE_LIMIT_EXCEEDED';
        statusCode = 429;
        userFriendlyMessage = 'AI extraction quota or rate limit exceeded. Please wait a few moments before retrying.';
      } else if (errStr.includes('API_KEY_INVALID') || errStr.includes('401') || errStr.includes('403')) {
        errorType = 'AUTHENTICATION_ERROR';
        statusCode = 401;
        userFriendlyMessage = 'Invalid or expired Gemini API key. Please check your credentials in the AI Studio settings.';
      } else if (errStr.includes('INVALID_ARGUMENT') || errStr.includes('Unable to process') || errStr.includes('unsupported MIME')) {
        errorType = 'UNSUPPORTED_DOCUMENT';
        statusCode = 400;
        userFriendlyMessage = `Document could not be processed by the OCR model. Please upload a clear PDF, PNG, or JPG image.`;
      }

      return res.status(statusCode).json({
        success: false,
        errorType,
        error: userFriendlyMessage,
        details: process.env.NODE_ENV !== 'production' ? errStr : undefined,
      });
    }

    // Safely strip Markdown code fences if returned by the model
    const cleanedJson = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsedData: any;
    try {
      parsedData = JSON.parse(cleanedJson);
    } catch (parseErr: any) {
      console.error('[OCR Backend] JSON parse error on response:', cleanedJson);
      return res.status(502).json({
        success: false,
        errorType: 'INVALID_AI_JSON',
        error: 'The AI model returned an unparseable response structure. Please retry extraction.',
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OCR Backend] Successfully extracted data with ${successfulModel}`);
    }

    return res.json({
      success: true,
      data: parsedData,
      extractedVia: `GEMINI_AI_OCR (${successfulModel})`,
    });
  } catch (error: any) {
    console.error('OCR Extraction unexpected server error:', error);
    res.status(500).json({
      success: false,
      errorType: 'SERVER_EXCEPTION',
      error: error.message || 'Unexpected server error during OCR extraction',
    });
  }
});

// Global error handling middleware ensuring JSON responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      errorType: 'FILE_TOO_LARGE',
      error: 'File size exceeds maximum upload limit (25MB). Please compress the invoice file before uploading.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      errorType: 'MALFORMED_JSON',
      error: 'Malformed JSON payload received by server.',
    });
  }
  return res.status(500).json({
    success: false,
    errorType: 'SERVER_ERROR',
    error: err?.message || 'Internal server error processing invoice document.',
  });
});

// Setup Vite middleware in dev or serve static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Biznexco server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
