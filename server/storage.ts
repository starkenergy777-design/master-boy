import { Pool, PoolClient } from 'pg';
import { Advertisement, AdminAuditLog, AiReport, ChatMessage, City, Craftsman, CraftsmanDraft, CraftsmanListing, ListingPrice, Profession, ProviderConfig, RecipientAccount, ConfigLock, Top15Membership, Top15Price, Top15Reservation, User } from './types.js';

export interface SuperAdminPersistedConfig {
  listingPrice: ListingPrice;
  top15Prices: Record<string, Top15Price>;
  advertisements: Advertisement[];
  providerConfig: ProviderConfig;
  recipientAccount: RecipientAccount;
  configLock: ConfigLock;
  bootstrap: { phone: string; password: string; enabled: boolean; invalidated: boolean; completedAt: string | null };
  backendConfig: { baseUrl: string; issuedAt: string; signature: string };
  version: number;
  lastPersistedAt: string;
}

export interface RuntimeState {
  users: Map<string, User>; craftsmen: Map<string, Craftsman>; craftsmanDrafts: Map<string, CraftsmanDraft>;
  top15Prices: Map<string, Top15Price>; top15Reservations: Map<string, Top15Reservation>;
  top15Memberships: Map<string, Top15Membership>; paymentIntents: Map<string, any>;
  craftsmanListings: Map<string, CraftsmanListing>; advertisements: Map<string, Advertisement>;
  supportMessages: ChatMessage[]; aiReports: AiReport[]; auditLog: AdminAuditLog[];
  listingPurgeLog: Array<{ id: string; craftsmanId: string; cityId: string; professionId: string; purgedAt: string; reason: string }>;
}

const date = (value: any): string => value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
const local = (row: any) => ({ ka: row.name_ka, ru: row.name_ru, en: row.name_en });

export class StorageService {
  private pool: Pool | null = null;
  private connected = false;
  private connectionError: string | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor() {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (connectionString) {
      this.pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX || 4), connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, ssl: { rejectUnauthorized: true }, application_name: 'master-boy-api' });
      this.pool.on('error', (e) => { this.connected = false; this.connectionError = e.message; });
    }
  }

  private db(): Pool {
    if (!this.pool) throw new Error('DATABASE_URL is required for Supabase Postgres storage.');
    return this.pool;
  }

  async connect(): Promise<void> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return;
    try { await this.db().query('SELECT 1'); this.connected = true; this.connectionError = null; }
    catch (e: any) { this.connected = false; this.connectionError = e.message; throw e; }
  }

  async loadCatalogs(): Promise<{ cities: City[]; professions: Profession[] }> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return { cities: [], professions: [] };
    const [c, p] = await Promise.all([
      this.db().query('SELECT id,name_ka,name_ru,name_en,is_active,lat,lng FROM public.cities ORDER BY display_order,id'),
      this.db().query('SELECT id,name_ka,name_ru,name_en FROM public.professions WHERE is_active=true ORDER BY display_order,id'),
    ]);
    this.connected = true;
    return {
      cities: c.rows.map((r) => ({ id:r.id, name:local(r), isActive:r.is_active, lat:Number(r.lat), lng:Number(r.lng) })),
      professions: p.rows.map((r) => ({ id:r.id, name:local(r) })),
    };
  }

  async loadSuperAdminConfig(): Promise<SuperAdminPersistedConfig | null> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return null;
    const [c, p] = await Promise.all([
      this.db().query("SELECT id,config_locked,lock_expires_at,config_unlock_hash,recipient_bank_name,recipient_iban,recipient_tax_id,recipient_company_name,standard_listing_price_minor,gemini_api_key_configured,bog_active,tbc_active,stripe_active,updated_at FROM public.system_config WHERE id='global_config' LIMIT 1"),
      this.db().query('SELECT * FROM public.top15_prices'),
    ]);
    const r = c.rows[0];
    if (!r) return null;
    const prices: Record<string, Top15Price> = {};
    for (const x of p.rows) prices[x.id] = { cityId:x.city_id, professionId:x.profession_id, amountMinor:Number(x.amount_minor), currency:x.currency, updatedAt:date(x.updated_at), updatedBy:x.updated_by || 'system' };
    const env = process.env;
    const payment = [
      { id:'prov-bog', name:'საქართველოს ბანკი (Bank of Georgia iPay)', apiKeyMasked:'not configured', clientId:env.BOG_MERCHANT_ID || '', secretKey:env.BOG_SECRET || '', isActive:Boolean(r.bog_active && env.BOG_SECRET) },
      { id:'prov-tbc', name:'თიბისი ბანკი (TBC Bank Checkout / Pay)', apiKeyMasked:'not configured', clientId:env.TBC_CLIENT_ID || '', secretKey:env.TBC_CLIENT_SECRET || '', isActive:Boolean(r.tbc_active && env.TBC_CLIENT_SECRET) },
      { id:'prov-stripe', name:'Stripe (საგადახდო სისტემა / Card Payments)', apiKeyMasked:'not configured', apiKey:env.STRIPE_PUBLISHABLE_KEY || '', secretKey:env.STRIPE_SECRET_KEY || '', webhookSecret:env.STRIPE_WEBHOOK_SECRET || '', isActive:Boolean(r.stripe_active && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) },
    ];
    this.connected = true;
    return {
      listingPrice:{ amountMinor:Number(r.standard_listing_price_minor), currency:'GEL', updatedAt:date(r.updated_at), updatedBy:'system' },
      top15Prices:prices, advertisements:[], providerConfig:{ payment, sms:[
        { id:'sms-magti', provider:'Magti SMS Gateway', senderId:'MASTER_BOY', isActive:Boolean(env.SMS_WEBHOOK_URL) },
        { id:'sms-geocell', provider:'Silknet/Geocell Direct', senderId:'MASTERBOY', isActive:false },
      ], email:[{ id:'email-ses', provider:'AWS SES / Sendgrid', host:env.SMTP_HOST || '', isActive:Boolean(env.SMTP_HOST) }],
      ai:{ configured:Boolean(env.GEMINI_API_KEY), verifiedAt:null, lastCallOk:false, provider:'Google Gemini Pro / Flash' } },
      recipientAccount:{ iban:r.recipient_iban || '', bankName:r.recipient_bank_name || '', beneficiary:r.recipient_company_name || '', taxNumber:r.recipient_tax_id || '', updatedAt:date(r.updated_at) },
      configLock:{ locked:Boolean(r.config_locked), lockedUntil:r.lock_expires_at ? date(r.lock_expires_at) : null, lockedAt:null, unlockCredentialHash:r.config_unlock_hash || undefined },
      bootstrap:{ phone:env.BOOTSTRAP_PHONE || '', password:'', enabled:Boolean(env.BOOTSTRAP_PASSWORD), invalidated:false, completedAt:null },
      backendConfig:{ baseUrl:env.APP_URL || '', issuedAt:date(r.updated_at), signature:'' }, version:1, lastPersistedAt:date(r.updated_at),
    };
  }

  async saveSuperAdminConfig(config: SuperAdminPersistedConfig): Promise<{ success:boolean; database:boolean; snapshot:boolean; error?:string }> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return { success:false,database:false,snapshot:false };
    try {
      const p = config.providerConfig.payment || [];
      const val = (id:string) => p.find((x) => x.id===id)?.isActive || false;
      await this.db().query(
        "INSERT INTO public.system_config (id,config_locked,lock_expires_at,config_unlock_hash,recipient_bank_name,recipient_iban,recipient_tax_id,recipient_company_name,standard_listing_price_minor,gemini_api_key_configured,bog_active,tbc_active,stripe_active,updated_at) VALUES ('global_config',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) ON CONFLICT(id) DO UPDATE SET config_locked=EXCLUDED.config_locked,lock_expires_at=EXCLUDED.lock_expires_at,config_unlock_hash=EXCLUDED.config_unlock_hash,recipient_bank_name=EXCLUDED.recipient_bank_name,recipient_iban=EXCLUDED.recipient_iban,recipient_tax_id=EXCLUDED.recipient_tax_id,recipient_company_name=EXCLUDED.recipient_company_name,standard_listing_price_minor=EXCLUDED.standard_listing_price_minor,gemini_api_key_configured=EXCLUDED.gemini_api_key_configured,bog_active=EXCLUDED.bog_active,tbc_active=EXCLUDED.tbc_active,stripe_active=EXCLUDED.stripe_active,updated_at=NOW()",
        [config.configLock.locked,config.configLock.lockedUntil,config.configLock.unlockCredentialHash || null,config.recipientAccount.bankName,config.recipientAccount.iban,config.recipientAccount.taxNumber,config.recipientAccount.beneficiary,config.listingPrice.amountMinor,Boolean(process.env.GEMINI_API_KEY),val('prov-bog'),val('prov-tbc'),val('prov-stripe')]);
      this.connected=true; return { success:true,database:true,snapshot:false };
    } catch(e:any) { this.connected=false; return { success:false,database:false,snapshot:false,error:e.message }; }
  }

  async loadRuntimeCollection<T=any>(name:string): Promise<Record<string,T>> {
    const out:Record<string,T> = {};
    if (!this.pool && process.env.NODE_ENV !== 'production') return out;
    const arrayTable:Record<string,string> = { __array_supportMessages:'support_messages',__array_aiReports:'ai_reports',__array_auditLog:'audit_logs',__array_listingPurgeLog:'listing_purge_logs' };
    if(arrayTable[name]) {
      const table=arrayTable[name];
      const result=await this.db().query('SELECT * FROM public.'+table+' ORDER BY id');
      for(const r of result.rows) {
        let v:any;
        if(table==='support_messages') v={id:r.id,craftsmanId:r.craftsman_id,sender:r.sender,body:r.body,flaggedForHuman:r.flagged_for_human,createdAt:date(r.created_at)};
        else if(table==='ai_reports') v={id:r.id,type:r.report_type,craftsmanId:r.craftsman_id,craftsmanName:r.craftsman_name,periodFrom:r.period_from?date(r.period_from):null,periodTo:r.period_to?date(r.period_to):null,content:r.content||{},createdAt:date(r.created_at)};
        else if(table==='audit_logs') v={id:r.id,actorType:r.actor_type,actorId:r.actor_id,action:r.action,targetType:r.target_type,targetId:r.target_id,reason:r.reason,createdAt:date(r.created_at)};
        else v={id:r.id,craftsmanId:r.craftsman_id,cityId:r.city_id,professionId:r.profession_id,purgedAt:dat