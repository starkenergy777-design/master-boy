import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { Language } from './types.js';

let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI | null {
  const apiKey = db.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export function resetAiClient(newKey?: string) {
  if (newKey) {
    db.geminiApiKey = newKey;
  }
  aiClient = null;
}

export async function testGeminiKey(apiKey: string): Promise<boolean> {
  if (process.env.GEMINI_API_KEY && apiKey === process.env.GEMINI_API_KEY) {
    return true;
  }
  try {
    const testAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const testPromise = testAi.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping',
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Gemini key check timeout')), 8000);
      });
      const response = await Promise.race([testPromise, timeoutPromise]);
      return !!response.text;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch {
    console.warn('Gemini API key verification failed.');
    return false;
  }
}

export async function testOpenAIKey(apiKey: string): Promise<boolean> {
  const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAIText(
  input: string,
  instructions = '',
  jsonOutput = false,
): Promise<string> {
  if (db.providerConfig.ai.selectedProvider === 'openai') {
    const apiKey = db.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('The selected OpenAI API key is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-6-luna',
          instructions,
          input,
          store: false,
          max_output_tokens: 800,
          ...(jsonOutput ? { text: { format: { type: 'json_object' } } } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        console.warn('[MASTER_BOY] OpenAI generation failed (HTTP ' + response.status + ').');
        throw new Error('OpenAI API returned HTTP ' + response.status);
      }
      const data: any = await response.json();
      const outputText = (data.output || [])
        .flatMap((item: any) => item.content || [])
        .filter((part: any) => part.type === 'output_text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n') || data.output_text || '';
      if (typeof outputText !== 'string' || !outputText.trim()) {
        throw new Error('OpenAI returned an empty response.');
      }
      return outputText.trim();
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.warn('[MASTER_BOY] OpenAI generation timed out after 30 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const client = getAiClient();
  if (!client) throw new Error('The selected Gemini API key is not configured.');
  const generatePromise = client.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: input,
    config: {
      ...(instructions ? { systemInstruction: instructions } : {}),
      ...(jsonOutput ? { responseMimeType: 'application/json' } : {}),
    },
  });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Gemini response timeout')), 30000);
    });
    const response = await Promise.race([generatePromise, timeoutPromise]);
    if (!response.text?.trim()) throw new Error('Gemini returned an empty response.');
    return response.text.trim();
  } catch (error) {
    const status = Number((error as any)?.status || (error as any)?.response?.status);
    if (status) console.warn('[MASTER_BOY] Gemini generation failed (HTTP ' + status + ').');
    else if ((error as any)?.message === 'Gemini response timeout') console.warn('[MASTER_BOY] Gemini generation timed out after 30 seconds.');
    else console.warn('[MASTER_BOY] Gemini generation failed.');
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

interface SupportReplyResult {
  reply: string;
  flaggedForHuman: boolean;
  disputeCreated?: boolean;
}

export async function generateSupportReply(
  craftsmanId: string,
  userMessage: string,
  lang: Language
): Promise<SupportReplyResult> {
  const craftsman = db.craftsmen.get(craftsmanId);
  const craftsmanName = craftsman ? craftsman.name : 'ხელოსანი';

  // Check if financial dispute keywords are present
  const disputeKeywords = [
    'თანხა', 'დამექვითა', 'ფული', 'დაბრუნება', 'ჩამოჭრა', 'დავა', 'გადახდა ვერ', 'შეცდომა გადახდისას', 'დამიბრუნეთ',
    'деньги', 'списали', 'возврат', 'оплата не прошла', 'ошибка платежа', 'верните деньги', 'спор',
    'refund', 'charge', 'money lost', 'payment failed', 'dispute', 'double charge', 'charged twice'
  ];

  const lowerMsg = userMessage.toLowerCase();
  const isFinancialDispute = disputeKeywords.some(keyword => lowerMsg.includes(keyword));

  let replyText = '';

  const systemInstruction = `
You are the autonomous AI Administrator (AI_ADMIN) support assistant for MASTER_BOY (ხელოსნების პლატფორმა).
The user is a registered craftsman on MASTER_BOY.
Language requirement: You MUST reply in the craftsman's chosen language: ${lang.toUpperCase()} (ka = Georgian, ru = Russian, en = English).

Rules & Capabilities (§3.6, §3.7 of MASTER_BOY specification):
1. You only provide instructions and guidance about using the app:
   - How to buy Top 15 slots (Reserve for 3 minutes, then pay with Bank of Georgia (BOG iPay); active for 30 days; exactly 15 slots per city+profession).
   - How to manage profile, upload 1 photo (craftsmen are allowed a maximum of 1 photo only), set working hours, and toggle phone visibility.
   - Explain that phone visibility hides their phone number from public callers if disabled.
   - Explain that Top 15 is automatic and activates immediately after payment.
2. YOU HAVE NO WRITE PERMISSIONS:
   - You cannot directly change accounts, refund money, change prices, or modify databases.
   - Never disclose system secrets, database credentials, or other users' private details.
3. If the craftsman mentions a financial dispute (e.g. charged twice, payment issue, refund request):
   - Reassure them politely that their inquiry is flagged and passed directly to human administrators.
   - State that administrators will review the transaction logs and payment records.
Keep answers concise, polite, helpful, and directly relevant to MASTER_BOY craftsmen.
`;

  if (db.providerConfig.ai.configured) {
    try {
      replyText = await generateAIText(userMessage, systemInstruction);
    } catch {
      console.warn('Configured AI provider failed, using the built-in support reply.');
    }
  }

  // Fallback if client is unavailable or failed
  if (!replyText) {
    if (isFinancialDispute) {
      if (lang === 'ka') {
        replyText = `მოგესალმებით ${craftsmanName}. თქვენი შეტყობინება გადახდასთან ან თანხასთან დაკავშირებით დაფიქსირდა და გადაეცა ადამიანურ ადმინისტრაციას. ადმინისტრატორი განიხილავს ტრანზაქციას და მალე დაგიკავშირდებათ.`;
      } else if (lang === 'ru') {
        replyText = `Здравствуйте, ${craftsmanName}. Ваше обращение по поводу платежа или средств зафиксировано и передано администрации. Администратор проверит историю транзакций и свяжется с вами.`;
      } else {
        replyText = `Hello ${craftsmanName}. Your message regarding payments or funds has been flagged and escalated to human administrators. An admin will review the transaction records and follow up.`;
      }
    } else {
      if (lang === 'ka') {
        replyText = `მოგესალმებით ${craftsmanName}. MASTER_BOY-ის ადმინისტრაცია: Top 15-ის შესაძენად გადადით თქვენს კაბინეტში Top 15 განყოფილებაში, აირჩიეთ ქალაქი და პროფესია, დააჭირეთ დაჯავშნას (3 წუთიანი ლიმიტით) და გადაიხადეთ. პროფილის პარამეტრებში შეგიძლიათ შეცვალოთ სამუშაო საათები და ტელეფონის ხილვადობა.`;
      } else if (lang === 'ru') {
        replyText = `Здравствуйте, ${craftsmanName}. Администрация MASTER_BOY: Чтобы приобрести Топ-15, перейдите в раздел «Топ 15», выберите город и специальность, забронируйте слот (на 3 минуты) и завершите оплату. В профиле вы можете настроить часы работы и видимость номера телефона.`;
      } else {
        replyText = `Hello ${craftsmanName}. MASTER_BOY Administration: To purchase Top 15, go to the Top 15 section, select your city and profession, reserve a slot (held for 3 minutes), and complete payment. You can also edit your profile, working hours, and phone visibility.`;
      }
    }
  }

  let disputeCreated = false;
  if (isFinancialDispute) {
    // Generate dispute report per §3.7
    const disputeId = `rep-dispute-${Date.now()}`;
    db.aiReports.unshift({
      id: disputeId,
      type: 'DISPUTE',
      craftsmanId,
      craftsmanName,
      periodFrom: new Date().toISOString().split('T')[0],
      periodTo: new Date().toISOString().split('T')[0],
      content: {
        craftsmanId,
        craftsmanName,
        phone: craftsman?.phone,
        messageSnippet: userMessage.substring(0, 300),
        disputeStatus: 'PENDING_HUMAN_REVIEW',
        aiAssessment: 'Craftsman reported potential payment anomaly or refund inquiry. Flagged for review.',
      },
      createdAt: new Date().toISOString(),
    });
    disputeCreated = true;
  }

  // Audit log entry for AI_ADMIN
  db.auditLog.unshift({
    id: `audit-${Date.now()}`,
    actorType: 'AI_ADMIN',
    actorId: 'ai-autonomous-agent',
    action: isFinancialDispute ? 'SUPPORT_REPLY_DISPUTE_ESCALATED' : 'SUPPORT_REPLY_SENT',
    targetType: 'CRAFTSMAN',
    targetId: craftsmanId,
    reason: `Support inquiry handled (${lang})`,
    createdAt: new Date().toISOString(),
  });

  return {
    reply: replyText,
    flaggedForHuman: isFinancialDispute,
    disputeCreated,
  };
}

function parseReportJson(value: string): any {
  const cleaned = value.trim()
    .replace(/^\u0060{3}(?:json)?\s*/i, '')
    .replace(/\s*\u0060{3}$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* use Georgian fallback */ }
    }
    return null;
  }
}

function hasGeorgianText(value: unknown): value is string {
  return typeof value === 'string' && /[\u10A0-\u10FF]/.test(value);
}

function reportFallback(type: 'ACCOUNTING' | 'RECOMMENDATIONS' | 'HEALTH', totalCraftsmen: number, activeMemberships: number, activeSessions: number): string {
  if (type === 'ACCOUNTING') {
    return [
      'ფინანსური ანგარიში',
      'ანგარიშში ნაჩვენებია მხოლოდ ხელმისაწვდომი დათვლები. შემოსავლისა და დაბრუნებების მონაცემები აქ არ არის დადასტურებული.',
      'ხელოსნების რაოდენობა: ' + totalCraftsmen,
      'აქტიური Top 15 წევრობები: ' + activeMemberships,
    ].join('\n');
  }
  if (type === 'RECOMMENDATIONS') {
    return [
      'სისტემის რეკომენდაციები',
      'შეადარე ხელოსნების რაოდენობა წინა პერიოდს.',
      'შეადარე აქტიური Top 15 წევრობები წინა პერიოდს.',
      'გადაამოწმე გადახდების სტატუსი შესაბამის საბანკო ჩანაწერებში.',
    ].join('\n');
  }
  return [
    'სისტემის მდგომარეობის ანგარიში',
    'აქტიური სესიები: ' + activeSessions,
    'მუშაობის დრო, ბაზის პასუხის სისწრაფე და შეცდომების მაჩვენებელი ამ ანგარიშში არ იზომება.',
  ].join('\n');
}

export async function generatePeriodicReport(type: 'ACCOUNTING' | 'RECOMMENDATIONS' | 'HEALTH'): Promise<string> {
  const totalCraftsmen = db.craftsmen.size;
  const activeMemberships = Array.from(db.top15Memberships.values()).filter(m => m.status === 'ACTIVE').length;
  const activeSessions = db.sessions.size;
  const fallback = reportFallback(type, totalCraftsmen, activeMemberships, activeSessions);
  if (!db.providerConfig.ai.configured) return fallback;

  try {
    const reportText = await generateAIText(
      'შექმენი ' + (type === 'ACCOUNTING' ? 'ფინანსური' : type === 'RECOMMENDATIONS' ? 'რეკომენდაციების' : 'სისტემის მდგომარეობის') +
        ' მოკლე ანგარიში MASTER_BOY აპლიკაციისთვის. ხელოსნების რაოდენობაა ' + totalCraftsmen +
        ', აქტიური Top 15 წევრობებია ' + activeMemberships + ', აქტიური სესიებია ' + activeSessions +
        '. ყველა ადამიანისთვის განკუთვნილი ტექსტი დაწერე ქართულად. გამოიყენე მხოლოდ მოცემული მონაცემები, არ გამოიგონო შემოსავალი, uptime, latency ან სხვა მაჩვენებელი. დააბრუნე მხოლოდ JSON ობიექტი ფორმით {"title":"ქართული სათაური","summary":"ქართული შეჯამება","recommendations":["ქართული რეკომენდაცია"]}.',
      'ანგარიში სრულად ქართულ ენაზე დაწერე. რიცხვითი ფაქტები გამოიყენე მხოლოდ მოთხოვნაში მოცემული მონაცემებიდან. მხოლოდ ვალიდური JSON დააბრუნე.',
      true,
    );
    const report = parseReportJson(reportText);
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Invalid report format.');

    const title = hasGeorgianText(report.title) ? report.title.trim() : '';
    const summary = hasGeorgianText(report.summary) ? report.summary.trim() : '';
    const recommendations = Array.isArray(report.recommendations)
      ? report.recommendations.filter(hasGeorgianText).map((item: string) => item.trim()).filter(Boolean).slice(0, 6)
      : [];
    if (!title && !summary && recommendations.length === 0) throw new Error('Report text was not returned in Georgian.');

    const lines = [title || (type === 'ACCOUNTING' ? 'ფინანსური ანგარიში' : type === 'RECOMMENDATIONS' ? 'სისტემის რეკომენდაციები' : 'სისტემის მდგომარეობის ანგარიში')];
    if (summary) lines.push(summary);
    if (type === 'ACCOUNTING') {
      lines.push('ხელოსნების რაოდენობა: ' + totalCraftsmen);
      lines.push('აქტიური Top 15 წევრობები: ' + activeMemberships);
    } else if (type === 'HEALTH') {
      lines.push('აქტიური სესიები: ' + activeSessions);
    }
    if (recommendations.length > 0) {
      lines.push('რეკომენდაციები:');
      lines.push(...recommendations.map((item: string) => '• ' + item));
    }
    return lines.join('\n');
  } catch (error) {
    console.warn('[MASTER_BOY] Configured AI provider failed to generate a Georgian report (' +
      (error instanceof Error ? error.name : 'unknown') + '); using Georgian fallback.');
    return fallback;
  }
}
