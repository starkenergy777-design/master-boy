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
import { sortProfessionsByDemand } from './professionOrder.js';

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
    { id: 'prof-gas-water-heater', name: { ka: 'გაზის კალონკის ხელოსანი', ru: 'Мастер по газовым колонкам', en: 'Gas water heater technician' } },
    { id: 'prof-sewer-cleaning', name: { ka: 'კანალიზაციის გაწმენდის სპეციალისტი', ru: 'Специалист по прочистке канализации', en: 'Sewer cleaning specialist' } },
    { id: 'prof-drywall', name: { ka: 'გიფსოკარდონის ხელოსანი', ru: 'Мастер по гипсокартону', en: 'Drywall installer' } },
    { id: 'prof-stretch-ceiling', name: { ka: 'ფრანგული ჭერის ხელოსანი', ru: 'Мастер по натяжным потолкам', en: 'Stretch ceiling installer' } },
    { id: 'prof-plasterer', name: { ka: 'მლესავი', ru: 'Штукатур', en: 'Plasterer' } },
    { id: 'prof-masonry', name: { ka: 'მშენებელი (ქვისა და ბლოკის წყობა)', ru: 'Строитель (кладка камня и блока)', en: 'Builder (stone and block masonry)' } },
    { id: 'prof-window-door', name: { ka: 'კარ-ფანჯრის ხელოსანი', ru: 'Мастер по дверям и окнам', en: 'Door and window installer' } },
    { id: 'prof-door-lock', name: { ka: 'კარისა და საკეტის ხელოსანი', ru: 'Мастер по дверям и замкам', en: 'Door and lock specialist' } },
    { id: 'prof-cctv-alarm', name: { ka: 'ვიდეოკამერებისა და სიგნალიზაციის ხელოსანი', ru: 'Мастер по видеонаблюдению и сигнализации', en: 'CCTV and alarm technician' } },
    { id: 'prof-welder', name: { ka: 'ელექტროშემდუღებელი (სვარკა)', ru: 'Электросварщик', en: 'Welder' } },
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
        name: 'საქართველოს ბანკი (Bank of Georgia Payment Manager)',
        apiKeyMasked: 'not configured',
        clientId: process.env.BOG_MERCHANT_ID || '',
        secretKey: process.env.BOG_SECRET || '',
        // Credentials alone do not mean a live gateway adapter is integrated.
        isActive: false,
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
      provider: process.env.AI_PROVIDER === 'openai' ? 'OpenAI API' : process.env.AI_PROVIDER === 'gemini' ? 'Google Gemini' : '',
      selectedProvider: process.env.AI_PROVIDER === 'openai' ? 'openai' : process.env.AI_PROVIDER === 'gemini' ? 'gemini' : null,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
  };

  geminiApiKey: string | null = process.env.GEMINI_API_KEY || null;
  openAiApiKey: string | null = process.env.OPENAI_API_KEY || null;

  // Recipient Account (§3.5, §6.6)
  recipientAccount: RecipientAccount = {
    iban: process.env.RECIPIENT_IBAN || '',
    bankName: process.env.RECIPIENT_BANK_NAME || '',
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
    this.professions = sortProfessionsByDemand(this.professions);
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
        phone: '+995599112233',
        name: 'გიორგი ბერიძე',
        description: 'პროფესიონალი სანტექნიკოსი 12 წლიანი გამოცდილებით. ნებისმიერი სირთულის სანტექნიკური სამუშაოები, მილების მონტაჟი, ონკანების შეცვლა.',
        phoneVisible: true,
        latitude: 41.7225,
        longitude: 44.7788,
        cityId: 'city-tbilisi',
        professionId: 'prof-plumber',
        workingHours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-19:00',
          saturday: '10:00-17:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-1',
            craftsmanId: 'cm-1',
            url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-2',
        phone: '+995577445566',
        name: 'დავით კაპანაძე',
        description: 'მაღალი კვალიფიკაციის ელექტრიკოსი. ელექტროგაყვანილობის სრული მონტაჟი, ავტომატების დაყენება, ჭაღების მონტაჟი, დამიწება.',
        phoneVisible: true,
        latitude: 41.7112,
        longitude: 44.8015,
        cityId: 'city-tbilisi',
        professionId: 'prof-electrician',
        workingHours: {
          monday: '08:00-20:00',
          tuesday: '08:00-20:00',
          wednesday: '08:00-20:00',
          thursday: '08:00-20:00',
          friday: '08:00-20:00',
          saturday: '09:00-18:00',
          sunday: '10:00-15:00',
        },
        photos: [
          {
            id: 'ph-2',
            craftsmanId: 'cm-2',
            url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-3',
        phone: '+995555889900',
        name: 'ლევან მაისურაძე',
        description: 'კონდიციონერების მონტაჟი, დემონტაჟი, ფრეონის დატუმბვა და სრული სერვისი გარანტიით. ბათუმი და შემოგარენი.',
        phoneVisible: true,
        latitude: 41.6210,
        longitude: 41.6250,
        cityId: 'city-batumi',
        professionId: 'prof-ac',
        workingHours: {
          monday: '09:00-18:00',
          tuesday: '09:00-18:00',
          wednesday: '09:00-18:00',
          thursday: '09:00-18:00',
          friday: '09:00-18:00',
          saturday: '09:00-15:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-3',
            craftsmanId: 'cm-3',
            url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-4',
        phone: '+995593123456',
        name: 'ალექსანდრე ნოზაძე',
        description: 'კაფელისა და მეტლახის დაგება ლაზერული სიზუსტით. აბაზანების სრული რემონტი, მოზაიკა, ჰიდროიზოლაცია.',
        phoneVisible: false, // Testing phoneVisible = false (§3.4)
        latitude: 41.7310,
        longitude: 44.7520,
        cityId: 'city-tbilisi',
        professionId: 'prof-tiler',
        workingHours: {
          monday: '09:00-18:00',
          tuesday: '09:00-18:00',
          wednesday: '09:00-18:00',
          thursday: '09:00-18:00',
          friday: '09:00-18:00',
          saturday: null,
          sunday: null,
        },
        photos: [
          {
            id: 'ph-4',
            craftsmanId: 'cm-4',
            url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: false,
      },
      {
        id: 'cm-5',
        phone: '+995577112244',
        name: 'თორნიკე გელაშვილი',
        description: 'მალიარი და სამღებრო სამუშაოების ოსტატი. კედლების დაჭიმვა, შპაკლი, ემულსია, შპალერის გაკვრა უმაღლესი ხარისხით.',
        phoneVisible: true,
        latitude: 41.7190,
        longitude: 44.7890,
        cityId: 'city-tbilisi',
        professionId: 'prof-painter',
        workingHours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-19:00',
          saturday: '10:00-16:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-5',
            craftsmanId: 'cm-5',
            url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-6',
        phone: '+995591998877',
        name: 'ვახტანგ ჯაფარიძე',
        description: 'საკეტების პროფესიონალი ოსტატი. ნებისმიერი ტიპის საკეტის გაღება დაზიანების გარეშე, ახლის ჩაყენება, შეკეთება.',
        phoneVisible: true,
        latitude: 41.7050,
        longitude: 44.8120,
        cityId: 'city-tbilisi',
        professionId: 'prof-locksmith',
        workingHours: {
          monday: '08:00-22:00',
          tuesday: '08:00-22:00',
          wednesday: '08:00-22:00',
          thursday: '08:00-22:00',
          friday: '08:00-22:00',
          saturday: '09:00-20:00',
          sunday: '10:00-18:00',
        },
        photos: [
          {
            id: 'ph-6',
            craftsmanId: 'cm-6',
            url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-7',
        phone: '+995558334455',
        name: 'ზურაბ ხუციშვილი',
        description: 'გათბობის სისტემების სრული მონტაჟი: ცენტრალური გათბობის ქვაბები, იატაკქვეშა გათბობა, რადიატორების შეცვლა და დიაგნოსტიკა.',
        phoneVisible: true,
        latitude: 41.7280,
        longitude: 44.7650,
        cityId: 'city-tbilisi',
        professionId: 'prof-heating',
        workingHours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-19:00',
          saturday: '10:00-16:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-7',
            craftsmanId: 'cm-7',
            url: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-8',
        phone: '+995574556677',
        name: 'გოჩა დოლიძე',
        description: 'ავეჯის ოსტატი და დურგალი. სამზარეულოს, საძინებლისა და ოფისის ავეჯის აწყობა-დაშლა, რესტავრაცია და მონტაჟი.',
        phoneVisible: true,
        latitude: 41.7150,
        longitude: 44.7700,
        cityId: 'city-tbilisi',
        professionId: 'prof-carpenter',
        workingHours: {
          monday: '09:00-18:00',
          tuesday: '09:00-18:00',
          wednesday: '09:00-18:00',
          thursday: '09:00-18:00',
          friday: '09:00-18:00',
          saturday: '10:00-15:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-8',
            craftsmanId: 'cm-8',
            url: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-9',
        phone: '+995568123789',
        name: 'ირაკლი კვირიკაშვილი',
        description: 'სანტექნიკოსი ბათუმში. მილების შეცვლა, საშხაპე კაბინების მონტაჟი, კანალიზაციის გაწმენდა.',
        phoneVisible: true,
        latitude: 41.6350,
        longitude: 41.6280,
        cityId: 'city-batumi',
        professionId: 'prof-plumber',
        workingHours: {
          monday: '09:00-20:00',
          tuesday: '09:00-20:00',
          wednesday: '09:00-20:00',
          thursday: '09:00-20:00',
          friday: '09:00-20:00',
          saturday: '09:00-17:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-9',
            craftsmanId: 'cm-9',
            url: 'https://images.unsplash.com/photo-1505798577917-a65157d3320a?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-10',
        phone: '+995598443322',
        name: 'მამუკა ჩხეიძე',
        description: 'ელექტრიკოსი ქუთაისში. ელექტრობის სრული მონტაჟი და დიაგნოსტიკა სახლებსა და კომერციულ ობიექტებში.',
        phoneVisible: true,
        latitude: 42.2660,
        longitude: 42.7100,
        cityId: 'city-kutaisi',
        professionId: 'prof-electrician',
        workingHours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-19:00',
          saturday: '10:00-16:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-10',
            craftsmanId: 'cm-10',
            url: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-11',
        phone: '+995577665544',
        name: 'ნიკოლოზ წიკლაური',
        description: 'კონდიციონერების ხელოსანი თბილისში. ყველა ბრენდის კონდიციონერის მონტაჟი, შეკეთება, გაწმენდა.',
        phoneVisible: true,
        latitude: 41.7350,
        longitude: 44.8200,
        cityId: 'city-tbilisi',
        professionId: 'prof-ac',
        workingHours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-19:00',
          saturday: '10:00-15:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-11',
            craftsmanId: 'cm-11',
            url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
      {
        id: 'cm-12',
        phone: '+995593887766',
        name: 'ოთარ გიორგაძე',
        description: 'კაფელ-მეტლახის ოსტატი რუსთავში და თბილისში. იატაკის და კედლის მოპირკეთება, გრანიტი, მარმარილო.',
        phoneVisible: true,
        latitude: 41.5520,
        longitude: 45.0010,
        cityId: 'city-rustavi',
        professionId: 'prof-tiler',
        workingHours: {
          monday: '09:00-18:00',
          tuesday: '09:00-18:00',
          wednesday: '09:00-18:00',
          thursday: '09:00-18:00',
          friday: '09:00-18:00',
          saturday: '10:00-16:00',
          sunday: null,
        },
        photos: [
          {
            id: 'ph-12',
            craftsmanId: 'cm-12',
            url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        isTop15: true,
      },
    ];

    for (const c of demoCraftsmen) {
      const userId = `usr-${c.id}`;
      const user: User = {
        id: userId,
        phone: c.phone,
        password: hashPassword(process.env.DEMO_PASSWORD || crypto.randomBytes(24).toString('base64url')),
        roles: ['CRAFTSMAN'],
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };
      this.users.set(userId, user);

      const craftsman: Craftsman = {
        id: c.id,
        userId: userId,
        name: c.name,
        description: c.description,
        phone: c.phone,
        phoneVisible: c.phoneVisible,
        latitude: c.latitude,
        longitude: c.longitude,
        workingHours: c.workingHours,
        status: 'ACTIVE',
        cityId: c.cityId,
        professionId: c.professionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photos: c.photos,
      };
      this.craftsmen.set(c.id, craftsman);

      if (c.isTop15) {
        const memId = `mem-${c.id}`;
        const city = this.cities.find(ct => ct.id === c.cityId)!;
        const prof = this.professions.find(pr => pr.id === c.professionId)!;
        const startsAt = new Date();
        const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
        this.top15Memberships.set(memId, {
          id: memId,
          craftsmanId: c.id,
          cityId: c.cityId,
          cityName: city.name.ka,
          professionId: c.professionId,
          professionName: prof.name.ka,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          status: 'ACTIVE',
        });
      }

      // Seed 6-month listing subscription (§3.11, §24)
      const listStartsAt = new Date();
      const listExpiresAt = new Date(listStartsAt.getTime() + 180 * 24 * 60 * 60 * 1000);
      const listGraceEndsAt = new Date(listExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      this.craftsmanListings.set(c.id, {
        id: `list-${c.id}`,
        craftsmanId: c.id,
        cityId: c.cityId,
        professionId: c.professionId,
        status: 'ACTIVE',
        startsAt: listStartsAt.toISOString(),
        expiresAt: listExpiresAt.toISOString(),
        graceEndsAt: listGraceEndsAt.toISOString(),
        createdAt: listStartsAt.toISOString(),
        updatedAt: listStartsAt.toISOString(),
      });
    }

    // Pre-seed Secret Administrator credentials
    const adminPhone = process.env.ADMIN_PHONE || '+995999000000';
    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(32).toString('base64url');
    const adminUser: User = {
      id: 'usr-admin',
      phone: adminPhone,
      password: hashPassword(adminPassword),
      roles: ['ADMIN'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    this.users.set(adminUser.id, adminUser);

    // Pre-seed Secret Super Administrator credentials
    const superAdminUser: User = {
      id: 'usr-superadmin',
      phone: this.bootstrap.phone,
      password: this.bootstrap.password ? hashPassword(this.bootstrap.password) : undefined,
      roles: ['SUPER_ADMIN'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    this.users.set(superAdminUser.id, superAdminUser);

    // Check Gemini API key from env
    if (this.geminiApiKey) {
      this.providerConfig.ai.configured = true;
      this.providerConfig.ai.verifiedAt = new Date().toISOString();
      this.providerConfig.ai.lastCallOk = true;
    }

    // Seed sample Gemini reports
    this.aiReports.push({
      id: 'rep-initial-accounting',
      type: 'ACCOUNTING',
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      content: {
        summary: 'Monthly automated revenue audit across all regions',
        totalRevenueGEL: 3450.0,
        activeTop15Slots: 4,
        refundsCount: 0,
        topCities: [
          { city: 'Tbilisi', revenueGEL: 2450.0, slots: 3 },
          { city: 'Batumi', revenueGEL: 1000.0, slots: 1 },
        ],
        payoutsPendingGEL: 0,
        status: 'BALANCED_OK',
      },
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    });

    this.aiReports.push({
      id: 'rep-initial-recommendations',
      type: 'RECOMMENDATIONS',
      periodFrom: '2026-09-15',
      periodTo: '2026-09-30',
      content: {
        title: 'Platform Utilization & Slot Pricing Strategy',
        observations: [
          'High demand for Air Conditioning technicians in Batumi with 100% Top 15 occupancy.',
          'Average response time in support chat: 1.4 seconds.',
          'Zero payment drop-offs observed across Bank of Georgia (BoG iPay) gateway.',
        ],
        actionableAdvice: [
          'Consider enabling Top 15 slots for Kutaisi Plumbers as search volume grew 24% this week.',
          'Keep current 3-minute reservation lock timeout as it minimizes slot hoards.',
        ],
      },
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    });

    // Seed verified commercial advertisement (Gorgia Construction Hypermarket Chain)
    const seedAdId = 'ad-gorgia-1';
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    this.advertisements.set(seedAdId, {
      id: seedAdId,
      company_name: '„გორგია“ - სამშენებლო ჰიპერმარკეტი (Gorgia)',
      phone_number: '+995599001122',
      password: hashPassword(process.env.DEMO_AD_PASSWORD || crypto.randomBytes(24).toString('base64url')),
      expires_at: thirtyDaysFromNow,
      image_url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80',
      target_url: 'https://gorgia.ge',
      is_active: true,
      payment_status: 'paid',
      terms_accepted: true,
      price_gel: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Register ad partner as user for direct login
    this.users.set('usr-ad-gorgia', {
      id: 'usr-ad-gorgia',
      phone: '+995599001122',
      password: hashPassword(process.env.DEMO_AD_PASSWORD || crypto.randomBytes(24).toString('base64url')),
      roles: ['AD_PARTNER'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });

    // Seed audit log
    this.auditLog.push({
      id: 'audit-0',
      actorType: 'AI_ADMIN',
      actorId: 'gemini-autonomous-agent',
      action: 'SYSTEM_BOOTSTRAP_AUDIT',
      targetType: 'SYSTEM',
      targetId: null,
      reason: 'Automated health verification of database schema v2.8.0',
      createdAt: new Date().toISOString(),
    });
  }

  getActiveAdvertisement(): Advertisement | null {
    const now = new Date();
    for (const ad of this.advertisements.values()) {
      if (
        ad.is_active &&
        ad.payment_status === 'paid' &&
        ad.company_name &&
        ad.company_name.trim().length > 0 &&
        ad.image_url &&
        ad.image_url.trim().length > 0 &&
        new Date(ad.expires_at) > now
      ) {
        return ad;
      }
    }
    return null;
  }

  // --- Localization helper ---
  getLocalizedName(item: { name: { ka: string; ru: string; en: string } }, lang: Language): string {
    return item.name[lang] || item.name.ka;
  }

  // --- Top 15 availability & hold cleanup (§4.2, §6.1, §6.3) ---
  getActiveTop15Memberships(cityId?: string, professionId?: string): Top15Membership[] {
    const now = Date.now();
    return Array.from(this.top15Memberships.values()).filter((membership) => {
      const craftsman = this.craftsmen.get(membership.craftsmanId);
      const expiresAt = Date.parse(membership.expiresAt);
      const eligibleCraftsman = craftsman?.status === 'ACTIVE' || craftsman?.status === 'EXPIRED';

      return membership.status === 'ACTIVE'
        && Number.isFinite(expiresAt)
        && expiresAt > now
        && eligibleCraftsman
        && craftsman!.cityId === membership.cityId
        && craftsman!.professionId === membership.professionId
        && (cityId === undefined || membership.cityId === cityId)
        && (professionId === undefined || membership.professionId === professionId);
    });
  }

  getActiveTop15Count(cityId: string, professionId: string): number {
    return this.getActiveTop15Memberships(cityId, professionId).length;
  }

  getActiveHoldCount(cityId: string, professionId: string): number {
    const now = Date.now();
    let count = 0;
    for (const res of this.top15Reservations.values()) {
      if (res.cityId === cityId && res.professionId === professionId && res.status === 'HELD') {
        if (res.expiresAt > now) {
          count++;
        } else {
          res.status = 'EXPIRED';
        }
      }
    }
    return count;
  }

  getTop15Availability(cityId: string, professionId: string): { freeSlots: number; price: Top15Price | null } {
    const price = this.top15Prices.get(`${cityId}:${professionId}`) || null;
    const active = this.getActiveTop15Count(cityId, professionId);
    const held = this.getActiveHoldCount(cityId, professionId);
    const freeSlots = Math.max(0, 15 - active - held);
    return { freeSlots, price };
  }

  // Convert craftsman to public format with localization & phone visibility
  toPublicCraftsman(c: Craftsman, lang: Language): CraftsmanPublic {
    const city = this.cities.find(ct => ct.id === c.cityId);
    const prof = this.professions.find(pr => pr.id === c.professionId);
    const primary = c.photos.find(p => p.isPrimary) || c.photos[0];

    // Only a live membership attached to a visible, matching profile qualifies.
    const isTop15 = this.getActiveTop15Memberships(c.cityId, c.professionId)
      .some((membership) => membership.craftsmanId === c.id);

    return {
      id: c.id,
      name: c.name,
      fullName: c.name,
      description: c.description,
      phone: c.phoneVisible ? c.phone : null,
      phoneVisible: c.phoneVisible,
      workingHours: c.workingHours,
      cityId: c.cityId,
      cityName: city ? this.getLocalizedName(city, lang) : '',
      professionId: c.professionId,
      professionName: prof ? this.getLocalizedName(prof, lang) : '',
      status: c.status,
      photos: c.photos,
      primaryPhotoUrl: primary ? primary.url : undefined,
      isTop15,
    };
  }

  getCraftsmanListing(craftsmanId: string): CraftsmanListing | undefined {
    return this.craftsmanListings.get(craftsmanId);
  }

  // Worker logic: hourly ExpiryWorker and daily PurgeWorker (§7.8)
  runListingWorkers(): void {
    const nowTime = Date.now();
    const nowIso = new Date(nowTime).toISOString();

    for (const [craftsmanId, listing] of this.craftsmanListings.entries()) {
      // 1. Expiry Worker: Transition ACTIVE -> EXPIRED when expiresAt passed
      if (listing.status === 'ACTIVE' && listing.expiresAt && new Date(listing.expiresAt).getTime() <= nowTime) {
        listing.status = 'EXPIRED';
        listing.graceEndsAt = new Date(new Date(listing.expiresAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        listing.updatedAt = nowIso;
        const cm = this.craftsmen.get(craftsmanId);
        if (cm) cm.status = 'EXPIRED';
      }

      // 2. Purge Worker: Transition EXPIRED -> PURGED when grace window (30d) passed (§24.4, §24.7)
      if (listing.status === 'EXPIRED' && listing.graceEndsAt && new Date(listing.graceEndsAt).getTime() <= nowTime) {
        // Purge is deferred if Top 15 is active (§24.7)
        let hasActiveTop15 = false;
        for (const mem of this.top15Memberships.values()) {
          if (mem.craftsmanId === craftsmanId && mem.status === 'ACTIVE' && new Date(mem.expiresAt).getTime() > nowTime) {
            hasActiveTop15 = true;
            break;
          }
        }

        if (!hasActiveTop15) {
          listing.status = 'PURGED';
          listing.updatedAt = nowIso;
          this.listingPurgeLog.push({
            id: `purge-${Date.now()}-${craftsmanId}`,
            craftsmanId,
            cityId: listing.cityId,
            professionId: listing.professionId,
            purgedAt: nowIso,
            reason: '30-day grace period expired without renewal (§24.4)',
          });

          // Hard-delete craftsman profile data
          this.craftsmen.delete(craftsmanId);
          this.craftsmanDrafts.delete(craftsmanId);
          this.supportMessages = this.supportMessages.filter(m => m.craftsmanId !== craftsmanId);
        }
      }
    }
  }

  async init(): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
          throw new Error('DATABASE_URL is required in production for Supabase Postgres storage.');
        }
      }

      if (storage.getStatus().databaseConfigured || process.env.NODE_ENV === 'production') {
        await storage.connect();
        const catalogs = await storage.loadCatalogs();
        if (!catalogs.cities.length || !catalogs.professions.length) {
          throw new Error('Supabase cities and professions catalogs must be seeded before the application can start.');
        }
        this.cities = catalogs.cities;
        this.professions = catalogs.professions;
      }

      // Production identities come only from deployment secrets; never from demo seed data.
      if (process.env.NODE_ENV === 'production') {
        this.users.clear();
        const now = new Date().toISOString();
        const adminPhone = process.env.ADMIN_PHONE!;
        const adminPassword = process.env.ADMIN_PASSWORD!;
        const bootstrapPhone = process.env.BOOTSTRAP_PHONE!;
        const bootstrapPassword = process.env.BOOTSTRAP_PASSWORD!;
        if (adminPhone && adminPassword) this.users.set('usr-admin', {
          id: 'usr-admin', phone: adminPhone, password: hashPassword(adminPassword),
          roles: ['ADMIN'], status: 'ACTIVE', createdAt: now,
        });
        if (bootstrapPhone && bootstrapPassword) this.users.set('usr-superadmin', {
          id: 'usr-superadmin', phone: bootstrapPhone, password: hashPassword(bootstrapPassword),
          roles: ['SUPER_ADMIN'], status: 'ACTIVE', createdAt: now,
        });
      }

      const persisted = await storage.loadSuperAdminConfig();
      if (persisted) {
        if (persisted.listingPrice) {
          this.listingPrice = persisted.listingPrice;
        }
        if (persisted.top15Prices && Object.keys(persisted.top15Prices).length > 0) {
          for (const [key, val] of Object.entries(persisted.top15Prices)) {
            this.top15Prices.set(key, val);
          }
        }
        if (persisted.advertisements && Array.isArray(persisted.advertisements)) {
          for (const ad of persisted.advertisements) {
            this.advertisements.set(ad.id, ad);
            if (ad.phone_number && ad.password) {
              const userId = `usr-${ad.id}`;
              this.users.set(userId, {
                id: userId,
                phone: ad.phone_number,
                password: ad.password.startsWith('scrypt$') ? ad.password : hashPassword(ad.password),
                roles: ['AD_PARTNER'],
                status: 'ACTIVE',
                createdAt: ad.created_at || new Date().toISOString(),
              });
              if (!ad.password.startsWith('scrypt$')) ad.password = this.users.get(userId)!.password;
            }
          }
        }
        if (persisted.providerConfig) {
          this.providerConfig = persisted.providerConfig;
        }
        if (persisted.recipientAccount) {
          this.recipientAccount = persisted.recipientAccount;
        }
        if (persisted.configLock) {
          this.configLock = persisted.configLock;
        }
        if (persisted.bootstrap) {
          this.bootstrap = {
            ...this.bootstrap,
            ...persisted.bootstrap,
            phone: process.env.NODE_ENV === 'production' ? (process.env.BOOTSTRAP_PHONE || persisted.bootstrap.phone || '') : (persisted.bootstrap.phone || this.bootstrap.phone),
            password: process.env.NODE_ENV === 'production' ? (process.env.BOOTSTRAP_PASSWORD || '') : (this.bootstrap.password || ''),
          };
        }
        if (persisted.backendConfig) {
          this.backendConfig = persisted.backendConfig;
        }
        console.log('[MASTER_BOY] SuperAdmin configuration hydrated successfully.');
      } else {
        await this.persistSuperAdminConfig();
      }

      const aiSettings = await storage.loadAiProviderSettings();
      this.geminiApiKey = aiSettings.geminiApiKey;
      this.openAiApiKey = aiSettings.openAiApiKey;
      this.providerConfig.ai.selectedProvider = aiSettings.selectedProvider;
      this.providerConfig.ai.geminiModel = aiSettings.geminiModel;
      this.providerConfig.ai.openaiModel = aiSettings.openaiModel;
      this.providerConfig.ai.geminiConfigured = Boolean(this.geminiApiKey);
      this.providerConfig.ai.openaiConfigured = Boolean(this.openAiApiKey);
      this.providerConfig.ai.configured = aiSettings.selectedProvider === 'openai'
        ? Boolean(this.openAiApiKey)
        : aiSettings.selectedProvider === 'gemini' && Boolean(this.geminiApiKey);
      this.providerConfig.ai.provider = aiSettings.selectedProvider === 'openai'
        ? 'OpenAI API'
        : aiSettings.selectedProvider === 'gemini' ? 'Google Gemini' : '';
      this.providerConfig.ai.verifiedAt = aiSettings.verifiedAt;
      this.providerConfig.ai.lastCallOk = Boolean(aiSettings.verifiedAt);

      const runtimeMaps: Array<[string, Map<string, any>]> = [
        ['users', this.users],
        ['craftsmen', this.craftsmen],
        ['craftsmanDrafts', this.craftsmanDrafts],
        ['top15Prices', this.top15Prices],
        ['top15Reservations', this.top15Reservations],
        ['top15Memberships', this.top15Memberships],
        ['paymentIntents', this.paymentIntents],
        ['craftsmanListings', this.craftsmanListings],
        ['advertisements', this.advertisements],
      ];
      for (const [name, map] of runtimeMaps) {
        const stored = await storage.loadRuntimeCollection(name);
        if (Object.keys(stored).length > 0) {
          map.clear();
          for (const [id, value] of Object.entries(stored)) map.set(id, value);
        }
      }
      const storedSupport = await storage.loadRuntimeArray<ChatMessage>('supportMessages');
      const storedReports = await storage.loadRuntimeArray<AiReport>('aiReports');
      const storedPurgeLog = await storage.loadRuntimeArray<ListingPurgeLog>('listingPurgeLog');
      const storedAudit = await storage.loadRuntimeArray<AdminAuditLog>('auditLog');
      if (storedSupport.length) this.supportMessages = storedSupport;
      if (storedReports.length) this.aiReports = storedReports;
      if (storedAudit.length) this.auditLog = storedAudit;
      if (storedPurgeLog.length) this.listingPurgeLog = storedPurgeLog;
      const requireDurable = process.env.REQUIRE_DURABLE_STORAGE !== 'false' && process.env.NODE_ENV === 'production';

      if (process.env.NODE_ENV === 'production') {
        // Supabase is authoritative after the first boot. Environment credentials
        // initialize missing administrator roles once and never reset saved passwords.
        const storedUsers = Array.from(this.users.values());
        if (!storedUsers.some(user => user.roles.includes('ADMIN'))) {
          if (!process.env.ADMIN_PHONE || !process.env.ADMIN_PASSWORD) {
            throw new Error('No active administrator exists. Set ADMIN_PHONE and ADMIN_PASSWORD in Render secrets for one-time initialization.');
          }
          this.users.set('usr-admin', {
            id: 'usr-admin', phone: process.env.ADMIN_PHONE, password: hashPassword(process.env.ADMIN_PASSWORD),
            roles: ['ADMIN'], status: 'ACTIVE', createdAt: new Date().toISOString(),
          });
        }
        if (!storedUsers.some(user => user.roles.includes('SUPER_ADMIN'))) {
          if (!process.env.BOOTSTRAP_PHONE || !process.env.BOOTSTRAP_PASSWORD) {
            throw new Error('No active super administrator exists. Set BOOTSTRAP_PHONE and BOOTSTRAP_PASSWORD in Render secrets for one-time initialization.');
          }
          this.users.set('usr-superadmin', {
            id: 'usr-superadmin', phone: process.env.BOOTSTRAP_PHONE, password: hashPassword(process.env.BOOTSTRAP_PASSWORD),
            roles: ['SUPER_ADMIN'], status: 'ACTIVE', createdAt: new Date().toISOString(),
          });
        }

        const bootstrapCompletion = this.auditLog.find(entry => entry.action === 'BOOTSTRAP_MIGRATION_COMPLETED');
        if (bootstrapCompletion) {
          this.bootstrap = {
            phone: '', password: '', enabled: false, invalidated: true,
            completedAt: bootstrapCompletion.createdAt,
          };
        } else if (process.env.BOOTSTRAP_PHONE && process.env.BOOTSTRAP_PASSWORD) {
          this.bootstrap = {
            ...this.bootstrap,
            phone: process.env.BOOTSTRAP_PHONE,
            password: process.env.BOOTSTRAP_PASSWORD,
            enabled: true,
            invalidated: false,
          };
        } else {
          this.bootstrap = { ...this.bootstrap, phone: '', password: '', enabled: false };
        }
      }
      // Upgrade legacy plaintext password values before the database snapshot is written.
      // Password verification below only accepts scrypt hashes after this one-time upgrade.
      let upgradedPasswordCount = 0;
      for (const user of this.users.values()) {
        if (user.password && !user.password.startsWith('scrypt$')) {
          user.password = hashPassword(user.password);
          upgradedPasswordCount += 1;
        }
      }
      if (upgradedPasswordCount > 0) {
        console.log(`[MASTER_BOY] Upgraded ${upgradedPasswordCount} legacy password hashes.`);
      }

      if (requireDurable && !storage.getStatus().databaseConnected) {
        throw new Error('Supabase Postgres is required in production but is not connected. Refusing to start with ephemeral-only persistence.');
      }
      if (process.env.NODE_ENV === 'production') {
        await this.persistRuntimeState();
      }
      console.log('[MASTER_BOY] Runtime state hydration completed.');
    } catch (err: any) {
      console.error('[MASTER_BOY] Error during db.init() hydration:', err);
      if (process.env.NODE_ENV === 'production') throw err;
    }
  }

  async persistRuntimeState(): Promise<void> {
    await storage.saveRuntimeState({
      users: this.users,
      craftsmen: this.craftsmen,
      craftsmanDrafts: this.craftsmanDrafts,
      top15Prices: this.top15Prices,
      top15Reservations: this.top15Reservations,
      top15Memberships: this.top15Memberships,
      paymentIntents: this.paymentIntents,
      craftsmanListings: this.craftsmanListings,
      advertisements: this.advertisements,
      supportMessages: this.supportMessages,
      aiReports: this.aiReports,
      auditLog: this.auditLog,
      listingPurgeLog: this.listingPurgeLog,
    });
  }

  async persistSuperAdminConfig(): Promise<{ success: boolean; database: boolean; snapshot: boolean; error?: string }> {
    const configToSave: SuperAdminPersistedConfig = {
      listingPrice: this.listingPrice,
      top15Prices: Object.fromEntries(this.top15Prices.entries()),
      advertisements: Array.from(this.advertisements.values()),
      providerConfig: this.providerConfig,
      recipientAccount: this.recipientAccount,
      configLock: this.configLock,
      bootstrap: { ...this.bootstrap, password: '' },
      backendConfig: this.backendConfig,
      version: 1,
      lastPersistedAt: new Date().toISOString(),
    };
    return await storage.saveSuperAdminConfig(configToSave);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export const db = new Database();


