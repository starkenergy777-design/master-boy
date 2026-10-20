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
    const response = await testAi.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping',
    });
    return !!response.text;
  } catch (err) {
    console.error('Gemini Key verification failed:', err);
    return false;
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

  const client = getAiClient();
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

  if (client) {
    try {
      const generatePromise = client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userMessage,
        config: {
          systemInstruction,
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI response timeout')), 3500)
      );
      const response = await Promise.race([generatePromise, timeoutPromise]);
      replyText = response.text || '';
    } catch (err) {
      console.warn('Gemini generateContent timed out or failed, using local reasoning:', err);
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
        geminiAssessment: 'Craftsman reported potential payment anomaly or refund inquiry. Flagged for review.',
      },
      createdAt: new Date().toISOString(),
    });
    disputeCreated = true;
  }

  // Audit log entry for AI_ADMIN
  db.auditLog.unshift({
    id: `audit-${Date.now()}`,
    actorType: 'AI_ADMIN',
    actorId: 'gemini-autonomous-agent',
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

export async function generatePeriodicReport(type: 'ACCOUNTING' | 'RECOMMENDATIONS' | 'HEALTH'): Promise<any> {
  const client = getAiClient();
  const totalCraftsmen = db.craftsmen.size;
  const activeMemberships = Array.from(db.top15Memberships.values()).filter(m => m.status === 'ACTIVE').length;
  const totalReports = db.aiReports.length;

  if (client) {
    try {
      const generatePromise = client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a short JSON report of type ${type} for craftsman app MASTER_BOY with ${totalCraftsmen} craftsmen and ${activeMemberships} active Top 15 memberships. Return valid JSON only.`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI report generation timeout')), 3500)
      );
      const response = await Promise.race([generatePromise, timeoutPromise]);
      const parsed = JSON.parse(response.text || '{}');
      return parsed;
    } catch (err) {
      console.warn('AI report generation error or timed out, using deterministic generator:', err);
    }
  }

  // Fallback structured content
  if (type === 'ACCOUNTING') {
    ret