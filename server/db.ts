import crypto from 'crypto';
import {
  City,
  Profession,
  Craftsman,
  CraftsmanPhoto,
  CraftsmanDraft,
  User,
  Top15Price,
  Top15Reservation,
  Top15Membership,
  PaymentIntent,
  ChatMessage,
  AiReport,
  AdminAuditLog,
  ProviderConfig,
  RecipientAccount,
  ConfigLock,
  Language,
  CraftsmanPublic,
  CraftsmanListing,
  ListingPrice,
  ListingPurgeLog,
  Advertisement,
  AdvertisementPublic,
} from './types.js';
import { storage, SuperAdminPersistedConfig } from './storage.js';

class Database {
  craftsmanListings: Map<string, CraftsmanListing> = new Map();
  listingPrice: ListingPrice = {
    amountMinor: 1000, // 10 GEL (R-25)
    currency: 'GEL',
    updatedAt: new Date().toISOString(),
    updatedBy: '00000000-0000-0000-0000-000000000000',
  };
  listingPurgeLog: ListingPurgeLog[] = [];
  cities: City[] = [
    { id: 'city-tbilisi', name: { ka: 'თბილისი', ru: 'Тбилиси', en: 'Tbilisi' }, isActive: true, lat: 41.7151, lng: 44.8271 },
    { id: 'city-batumi', name: { ka: 'ბათუმი', ru: 'Батуми', en: 'Batumi' }, isActive: true, lat: 41.6168, lng: 41.6367 },
    { id: 'city-kutaisi', name: { ka: 'ქუთაისი', ru: 'Кутаиси', en: 'Kutaisi' }, isActive: true, lat: 42.2662, lng: 42.7180 },
    { id: 'city-rustavi', name: { ka: 'რუსთავი', ru: 'Рустави', en: 'Rustavi' }, isActive: true, lat: 41.5495, lng: 44.9932 },
    { id: 'city-akhaltsikhe', name: { ka: 'ახალციხე', ru: 'Ахалцихе', en: 'Akhaltsikhe' }, isActive: true, lat: 41.643429, lng: 42.993445 },
    { id: 'city-borjomi', name: { ka: 'ბორჯომი', ru: 'Боржоми', en: 'Borjomi' }, isActive: true, lat: 41.839953, lng: 43.390757 },
    { id: 'city-gori', name: { ka: 'გორი', ru: 'Гори', en: 'Gori' }, isActive: true, lat: 41.9842, lng: 44.1158 },
    { id: 'city-zestafoni', name: { ka: 'ზესტაფონი', ru: 'Зестафони', en: 'Zestafoni' }, isActive: true, lat: 42.108333, lng: 43.037493 },
    { id: 'city-zugdidi', name: { ka: 'ზუგდიდი', ru: 'Зугдиди', en: 'Zugdidi' }, isActive: true, lat: 42.5088, lng: 41.8709 },
    { id: 'city-telavi', name: { ka: 'თელავი', ru: 'Телави', en: 'Telavi' }, isActive: true, lat: 41.9198, lng: 45.4731 },
    { id: 'city-martvili', name: { ka: 'მარტვილი', ru: 'Мартвили', en: 'Martvili' }, isActive: true, lat: 42.423184, lng: 42.381115 },
    { id: 'city-samtredia', name: { ka: 'სამტრედია', ru: 'Самтредиа', en: 'Samtredia' }, isActive: true, lat: 42.159926, lng: 42.336768 },
    { id: 'city-svaneti', name: { ka: 'სვანეთი', ru: 'Сванетия', en: 'Svaneti' }, isActive: true, lat: 43.0438, lng: 42.723680 },
    { id: 'city-poti', name: { ka: 'ფოთი', ru: 'Поти', en: 'Poti' }, isActive: true, lat: 42.1462, lng: 41.6720 },
    { id: 'city-kobuleti', name: { ka: 'ქობულეთი', ru: 'Кобулети', en: 'Kobuleti' }, isActive: true, lat: 41.815997, lng: 41.783810 },
    { id: 'city-tskaltubo', name: { ka: 'წყალტუბო', ru: 'Цхалтубо', en: 'Tskaltubo' }, isActive: true, lat: 42.328499, lng: 42.600368 },
    { id: 'city-khashuri', name: { ka: 'ხაშური', ru: 'Хашури', en: 'Khashuri' }, isActive: true, lat: 41.983769, lng: 43.586595 },
  ];

  professions: Profession[] = [
    { id: 'prof-plumber', name: { ka: 'სანტექნიკოსი', ru: 'Сантехник', en: 'Plumber' } },
    { id: 'prof-electrician', name: { ka: 'ელექტრიკოსი', ru: 'Электрик', en: 'Electrician' } },
    { id: 'prof-ac', name: { ka: 'კონდიციონერის ხელოსანი', ru: 'Мастер кондиционеров', en: 'HVAC / AC Master' } },
    { id: 'prof-carpenter', name: { ka: 'ავეჯის ხელოსანი / დურგალი', ru: 'Мебельщик / Плотник', en: 'Furniture / Carpenter' } },
    { id: 'prof-painter', name: { ka: 'მღებავი / სამღებრო', ru: 'Маляр', en: 'Painter' } },
    { id: 'prof-tiler', name: { ka: 'მეკაფელე', ru: 'Плиточник', en: 'Tiler' } },
    { id: 'prof-locksmith', name: { ka: 'საკეტების ხელოსანი', ru: 'Замочный мастер', en: 'Locksmith' } },
    { id: 'prof-heating', name: { ka: 'გათბობის ხელოსანი', ru: 'Мастер по отоплению', en: 'Heating Specialist' } },
    { id: 'prof-demolition-drill', name: { ka: 'პერფერატორით დანგრევა', ru: 'Демонтаж перфоратором', en: 'Demolition with a hammer drill' } },
    { id: 'prof-waste-removal', name: { ka: 'ნაგვის გატანა', ru: 'Вывоз мусора', en: 'Waste removal' } },
  ];

  users: Map<string, User> = new Map();
  craftsmen: Map<string, Craftsman> = new Map();
  craftsmanDrafts: Map<string, CraftsmanDraft> = new Map();
  top15Prices: Map<string, Top15Price> = new Map(); // key: `${cityId}:${professionId}`
  top15Reservations: Map<string, Top15Reservation> = new Map();
  top15Memberships: Map<string, Top15Membership> = new Map();
  paymentIntents: Map<string, PaymentIntent> = new Map();
  supportMessages: ChatMessage[] = [];
  aiReports: AiReport[] = [];
  auditLog: AdminAuditLog[] = [];
  sessions: Map<string, { userId: string; createdAt: number }> = new Map();
  otpChallenges: Map<string, { phone: string; code: string; expiresAt: number }> = new Map();
  advertisements: Map<string, Advertisement> = new Map();

  // Providers config (§3.8, §6.6)
  providerConfig: ProviderConfig = {
    payment: [
      {
        id: 'prov-bog',
        name: 'საქართველოს ბანკი (Bank of Georgia iPay)',
        apiKeyMasked: 'not configured',
        clientId: process.env.BOG_MERCHANT_ID || '',
        secretKey: process.env.BOG_SECRET || '',
        isActive: !!(process.env.BOG_MERCHANT_ID && process.env.BOG_SECRET),
      },
      {
        id: 'prov-tbc',
        name: 'თიბისი ბანკი (TBC Bank Checkout / Pay)',
        apiKeyMasked: 'not configured',
        clientId: process.env.TBC_CLIENT_ID || '',
        secretKey: process.env.TBC_CLIENT_SECRET || '',
        isActive: false,
      },
      {
        id: 'prov-stripe',
        name: 'Stripe (საგადახდო სისტემა / Card Payments)',
        apiKeyMasked: 'not configured',
        apiKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        isActive: false,
      },
    ],
    sms: [
      { id: 'sms-magti', provider: 'Magti SMS Gateway', senderId: 'MASTER_BOY', isActive: true },
      { id: 'sms-geocell', provider: 'Silknet/Geocell Direct', senderId: 'MASTERBOY', isActive: true },
    ],
    email: [
      { id: 'email-ses', provider: 'AWS SES / Sendgrid', host: 'smtp.sendgrid.net', isActive: true },
    ],
    ai: {
      configured: false,
      verifiedAt: null,
      lastCallOk: false,
      provider: 'Google Gemini Pro / Flash',
    },
  };

  geminiApiKey: string | null = process.env.GEMINI_API_KEY || null;

  // Recipient Account (§3.5, §6.6)
  recipientAccount: RecipientAccount = {
    iban: process.env.RECIPIENT_IBAN || '',
    bankName: 'საქართველოს ბანკი (Bank of Georgia JSC)',
    beneficiary: process.env.RECIPIENT_BENEFICIARY || '',
    taxNumber: process.env.RECIPIENT_TAX_NUMBER || '',
    updatedAt: new Date().toISOString(),
  };

  // Configuration Lock (§3.5)
  configLock: ConfigLock = {
    locked: false,
    lockedUntil: null,
    lockedAt: null,
    unlockCredentialHash: undefined,
  };

  // Bootstrap Super Admin credentials (§16)
  bootstrap = {
    phone: process.env.BOOTSTRAP_PHONE || '+995000000000',
    password: process.env.BOOTSTRAP_PASSWORD || '',
    enabled: Boolean(process.env.BOOTSTRAP_PASSWORD),
    invalidated: false,
    completedAt: null as string | null,
  };

  // Backend URL signature (§16.4)
  backendConfig = {
    baseUrl: process.env.APP_URL || '',
    issuedAt: new Date().toISOString(),
    signature: '',
  };

  constructor() {
    this.seedInitialData();
    if (process.env.NODE_ENV === 'production') {
      // Never ship demo identities, listings, advertisements, reports or audit data.
      // Static catalogs/pricing remain available and are hydrated from durable storage.
      this.users.clear();
      this.craftsmen.clear();
      this.craftsmanDrafts.clear();
      this.craftsmanListings.clear();
      this.top15Memberships.clear();
      this.top15Reservations.clear();
      this.paymentIntents.clear();
      this.advertisements.clear();
      this.aiReports = [];
      this.auditLog = [];
      this.supportMessages = [];
    }
  }

  seedInitialData() {
    // Seed Top 15 default prices for all city and profession combinations (§7.3)
    for (const city of this.cities) {
      for (const prof of this.professions) {
        let baseMinor = 5000;
        if (city.id === 'city-batumi') baseMinor = 4500;
        else if (city.id === 'city-kutaisi') baseMinor = 3500;
        else if (city.id === 'city-rustavi') baseMinor = 3500;
        else if (city.id !== 'city-tbilisi') baseMinor = 3000;

        if (prof.id === 'prof-ac' || prof.id === 'prof-heating') baseMinor += 1500;
        if (prof.id === 'prof-tiler') baseMinor += 1000;

        this.top15Prices.set(`${city.id}:${prof.id}`, {
          cityId: city.id,
          professionId: prof.id,
          amountMinor: baseMinor,
          currency: 'GEL',
          updatedAt: new Date().toISOString(),
          updatedBy: 'system-bootstrap',
        });
      }
    }

    // Seed some initial craftsmen
    const demoCraftsmen = [
      {
        id: 'cm-1',
  