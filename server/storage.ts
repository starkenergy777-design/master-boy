import { Pool, PoolClient } from 'pg';
import { Advertisement, AdminAuditLog, AiReport, ChatMessage, City, Craftsman, CraftsmanDraft, CraftsmanListing, ListingPrice, Profession, ProviderConfig, RecipientAccount, ConfigLock, Top15Membership, Top15Price, Top15Reservation, User } from './types.js';

export type AiProvider = 'gemini' | 'openai';

export interface AiProviderSettings {
  selectedProvider: AiProvider | null;
  geminiApiKey: string | null;
  openAiApiKey: string | null;
  verifiedAt: string | null;
}

export interface SuperAdminAgentMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SuperAdminAgentSettings {
  enabled: boolean;
  rules: string;
  messages: SuperAdminAgentMessage[];
}

const SUPERADMIN_AGENT_MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeSuperAdminAgentSettings(value: any): SuperAdminAgentSettings {
  const cutoff = Date.now() - SUPERADMIN_AGENT_MESSAGE_RETENTION_MS;
  const messages = Array.isArray(value?.messages)
    ? value.messages
        .filter((message: any) => {
          if ((message?.role !== 'user' && message?.role !== 'assistant') || typeof message?.content !== 'string') return false;
          const createdAt = typeof message.createdAt === 'string' ? Date.parse(message.createdAt) : NaN;
          return Number.isFinite(createdAt) && createdAt >= cutoff;
        })
        .slice(-50)
        .map((message: any) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content.slice(0, 5000),
          createdAt: message.createdAt as string,
        }))
    : [];
  return {
    enabled: value?.enabled === true,
    rules: typeof value?.rules === 'string' ? value.rules.slice(0, 6000) : '',
    messages,
  };
}

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
  private superAdminAgentSettings: SuperAdminAgentSettings = { enabled: false, rules: '', messages: [] };

  constructor() {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (connectionString) {
      const caCertificate = process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, '\n').trim();
      if (process.env.NODE_ENV === 'production' && !caCertificate) {
        throw new Error('SUPABASE_DB_CA_CERT is required in production to verify the Supabase TLS certificate.');
      }

      // node-postgres lets ssl query parameters override the explicit `ssl` option.
      // Remove them so the Supabase CA below is always used for strict verification.
      const databaseUrl = new URL(connectionString);
      ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].forEach((key) => databaseUrl.searchParams.delete(key));
      this.pool = new Pool({
        connectionString: databaseUrl.toString(),
        max: Number(process.env.DB_POOL_MAX || 4),
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        ssl: { ca: caCertificate, rejectUnauthorized: true },
        application_name: 'master-boy-api',
        // Assume the restricted backend role on every pooled connection so RLS
        // and column grants apply even when DATABASE_URL uses Supabase's postgres login.
        onConnect: async (client) => {
          if (process.env.NODE_ENV === 'production') {
            await client.query('SET ROLE masterboy_app');
          }
        },
      });
      this.pool.on('error', (e) => { this.connected = false; this.connectionError = e.message; });
    }
  }

  private db(): Pool {
    if (!this.pool) throw new Error('DATABASE_URL is required for Supabase Postgres storage.');
    return this.pool;
  }

  async connect(): Promise<void> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return;
    try {
      const result = await this.db().query('SELECT current_user AS runtime_role');
      if (process.env.NODE_ENV === 'production' && result.rows[0]?.runtime_role !== 'masterboy_app') {
        throw new Error('Production database connection must use the restricted masterboy_app role.');
      }
      this.connected = true;
      this.connectionError = null;
    }
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
    const [c, p, secrets] = await Promise.all([
      this.db().query("SELECT id,config_locked,lock_expires_at,config_unlock_hash,recipient_bank_name,recipient_iban,recipient_tax_id,recipient_company_name,standard_listing_price_minor,gemini_api_key_configured,bog_active,tbc_active,stripe_active,updated_at FROM public.system_config WHERE id='global_config' LIMIT 1"),
      this.db().query('SELECT * FROM public.top15_prices'),
      this.db().query("SELECT secret_value FROM public.server_secrets WHERE secret_name='provider_config' LIMIT 1"),
    ]);
    const r = c.rows[0];
    if (!r) return null;
    const persistedSettings = secrets.rows[0]?.secret_value || {};
    const savedProviders = persistedSettings.providerConfig || {};
    const prices: Record<string, Top15Price> = {};
    for (const x of p.rows) prices[x.id] = { cityId:x.city_id, professionId:x.profession_id, amountMinor:Number(x.amount_minor), currency:x.currency, updatedAt:date(x.updated_at), updatedBy:x.updated_by || 'system' };
    const env = process.env;
    const aiProvider: AiProvider | null = env.AI_PROVIDER === 'openai' ? 'openai' : env.AI_PROVIDER === 'gemini' ? 'gemini' : null;
    const envPayment = [
      { id:'prov-bog', name:'საქართველოს ბანკი (Bank of Georgia iPay)', apiKeyMasked:'not configured', clientId:env.BOG_MERCHANT_ID || '', secretKey:env.BOG_SECRET || '', isActive:Boolean(r.bog_active && env.BOG_SECRET) },
      { id:'prov-tbc', name:'თიბისი ბანკი (TBC Bank Checkout / Pay)', apiKeyMasked:'not configured', clientId:env.TBC_CLIENT_ID || '', secretKey:env.TBC_CLIENT_SECRET || '', isActive:Boolean(r.tbc_active && env.TBC_CLIENT_SECRET) },
      { id:'prov-stripe', name:'Stripe (საგადახდო სისტემა / Card Payments)', apiKeyMasked:'not configured', apiKey:env.STRIPE_PUBLISHABLE_KEY || '', secretKey:env.STRIPE_SECRET_KEY || '', webhookSecret:env.STRIPE_WEBHOOK_SECRET || '', isActive:Boolean(r.stripe_active && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) },
    ];
    const payment = Array.isArray(savedProviders.payment) ? savedProviders.payment : envPayment;
    const sms = Array.isArray(savedProviders.sms) ? savedProviders.sms : [
      { id:'sms-magti', provider:'Magti SMS Gateway', senderId:'MASTER_BOY', isActive:Boolean(env.SMS_WEBHOOK_URL) },
      { id:'sms-geocell', provider:'Silknet/Geocell Direct', senderId:'MASTERBOY', isActive:false },
    ];
    const email = Array.isArray(savedProviders.email) ? savedProviders.email : [
      { id:'email-ses', provider:'AWS SES / Sendgrid', host:env.SMTP_HOST || '', isActive:Boolean(env.SMTP_HOST) },
    ];
    this.connected = true;
    return {
      listingPrice:{ amountMinor:Number(r.standard_listing_price_minor), currency:'GEL', updatedAt:date(r.updated_at), updatedBy:'system' },
      top15Prices:prices, advertisements:[], providerConfig:{ payment, sms, email,
      ai:{
        configured:Boolean(aiProvider === 'openai' ? env.OPENAI_API_KEY : aiProvider === 'gemini' && env.GEMINI_API_KEY),
        verifiedAt:null,
        lastCallOk:false,
        provider:aiProvider === 'openai' ? 'OpenAI API' : aiProvider === 'gemini' ? 'Google Gemini' : '',
        selectedProvider:aiProvider,
        geminiConfigured:Boolean(env.GEMINI_API_KEY),
        openaiConfigured:Boolean(env.OPENAI_API_KEY),
      } },
      recipientAccount:{ iban:r.recipient_iban || '', bankName:r.recipient_bank_name || '', beneficiary:r.recipient_company_name || '', taxNumber:r.recipient_tax_id || '', updatedAt:date(r.updated_at) },
      configLock:{ locked:Boolean(r.config_locked), lockedUntil:r.lock_expires_at ? date(r.lock_expires_at) : null, lockedAt:null, unlockCredentialHash:r.config_unlock_hash || undefined },
      bootstrap:{ phone:env.BOOTSTRAP_PHONE || '', password:'', enabled:Boolean(env.BOOTSTRAP_PASSWORD), invalidated:false, completedAt:null },
      backendConfig: persistedSettings.backendConfig || { baseUrl:env.APP_URL || '', issuedAt:date(r.updated_at), signature:'' }, version:1, lastPersistedAt:date(r.updated_at),
    };
  }

  async loadAiProviderSettings(): Promise<AiProviderSettings> {
    const envProvider: AiProvider | null = process.env.AI_PROVIDER === 'openai' ? 'openai' : process.env.AI_PROVIDER === 'gemini' ? 'gemini' : null;
    if (!this.pool && process.env.NODE_ENV !== 'production') {
      return {
        selectedProvider: envProvider,
        geminiApiKey: process.env.GEMINI_API_KEY || null,
        openAiApiKey: process.env.OPENAI_API_KEY || null,
        verifiedAt: null,
      };
    }
    const result = await this.db().query(
      "SELECT secret_value FROM public.server_secrets WHERE secret_name='ai_provider' LIMIT 1"
    );
    const value = result.rows[0]?.secret_value || {};
    return {
      selectedProvider: value.selectedProvider === 'openai' ? 'openai' : value.selectedProvider === 'gemini' ? 'gemini' : envProvider,
      geminiApiKey: (typeof value.geminiApiKey === 'string' && value.geminiApiKey) || process.env.GEMINI_API_KEY || null,
      openAiApiKey: (typeof value.openAiApiKey === 'string' && value.openAiApiKey) || process.env.OPENAI_API_KEY || null,
      verifiedAt: typeof value.verifiedAt === 'string' ? value.verifiedAt : null,
    };
  }

  async saveAiProviderSettings(settings: AiProviderSettings): Promise<void> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return;
    await this.db().query(
      `INSERT INTO public.server_secrets (secret_name, secret_value, updated_at)
       VALUES ('ai_provider', $1::jsonb, NOW())
       ON CONFLICT (secret_name) DO UPDATE
       SET secret_value=EXCLUDED.secret_value, updated_at=NOW()`,
      [JSON.stringify(settings)]
    );
    this.connected = true;
  }

  async saveSuperAdminConfig(config: SuperAdminPersistedConfig): Promise<{ success:boolean; database:boolean; snapshot:boolean; error?:string }> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return { success:false,database:false,snapshot:false };
    let client: PoolClient | null = null;
    try {
      client = await this.db().connect();
      await client.query('BEGIN');
      const p = config.providerConfig.payment || [];
      const val = (id:string) => p.find((x) => x.id===id)?.isActive || false;
      await client.query(
        "INSERT INTO public.system_config (id,config_locked,lock_expires_at,config_unlock_hash,recipient_bank_name,recipient_iban,recipient_tax_id,recipient_company_name,standard_listing_price_minor,gemini_api_key_configured,bog_active,tbc_active,stripe_active,updated_at) VALUES ('global_config',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) ON CONFLICT(id) DO UPDATE SET config_locked=EXCLUDED.config_locked,lock_expires_at=EXCLUDED.lock_expires_at,config_unlock_hash=EXCLUDED.config_unlock_hash,recipient_bank_name=EXCLUDED.recipient_bank_name,recipient_iban=EXCLUDED.recipient_iban,recipient_tax_id=EXCLUDED.recipient_tax_id,recipient_company_name=EXCLUDED.recipient_company_name,standard_listing_price_minor=EXCLUDED.standard_listing_price_minor,gemini_api_key_configured=EXCLUDED.gemini_api_key_configured,bog_active=EXCLUDED.bog_active,tbc_active=EXCLUDED.tbc_active,stripe_active=EXCLUDED.stripe_active,updated_at=NOW()",
        [config.configLock.locked,config.configLock.lockedUntil,config.configLock.unlockCredentialHash || null,config.recipientAccount.bankName,config.recipientAccount.iban,config.recipientAccount.taxNumber,config.recipientAccount.beneficiary,config.listingPrice.amountMinor,Boolean(config.providerConfig.ai.geminiConfigured || process.env.GEMINI_API_KEY),val('prov-bog'),val('prov-tbc'),val('prov-stripe')]);
      await client.query(
        `INSERT INTO public.server_secrets AS current_secrets (secret_name, secret_value, updated_at)
         VALUES ('provider_config', $1::jsonb, NOW())
         ON CONFLICT (secret_name) DO UPDATE
         SET secret_value=COALESCE(current_secrets.secret_value, '{}'::jsonb) || EXCLUDED.secret_value,
             updated_at=NOW()`,
        [JSON.stringify({ providerConfig: config.providerConfig, backendConfig: config.backendConfig })]
      );
      await client.query('COMMIT');
      this.connected=true; return { success:true,database:true,snapshot:false };
    } catch(e:any) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      this.connected=false; return { success:false,database:false,snapshot:false,error:e.message };
    } finally {
      client?.release();
    }
  }

  async pruneSuperAdminAgentMessages(now = Date.now()): Promise<boolean> {
    const cutoff = new Date(now - SUPERADMIN_AGENT_MESSAGE_RETENTION_MS).toISOString();
    if (!this.pool && process.env.NODE_ENV !== 'production') {
      const current = this.superAdminAgentSettings;
      const normalized = normalizeSuperAdminAgentSettings(current);
      const changed = normalized.messages.length !== current.messages.length;
      if (changed) this.superAdminAgentSettings = normalized;
      return changed;
    }
    const result = await this.db().query(
      `UPDATE public.server_secrets AS config
       SET secret_value = jsonb_set(
             config.secret_value,
             '{superAdminAgent,messages}',
             COALESCE((
               SELECT jsonb_agg(message_rows.message ORDER BY message_rows.ordinality)
               FROM jsonb_array_elements(config.secret_value #> '{superAdminAgent,messages}')
                    WITH ORDINALITY AS message_rows(message, ordinality)
               WHERE COALESCE(message_rows.message->>'createdAt', '') >= $1::text
             ), '[]'::jsonb),
             true
           ),
           updated_at = NOW()
       WHERE config.secret_name = 'provider_config'
         AND jsonb_typeof(config.secret_value #> '{superAdminAgent,messages}') = 'array'
         AND EXISTS (
           SELECT 1
           FROM jsonb_array_elements(config.secret_value #> '{superAdminAgent,messages}') AS expired_messages(message)
           WHERE COALESCE(expired_messages.message->>'createdAt', '') < $1::text
         )
       RETURNING config.secret_value #> '{superAdminAgent,messages}' AS messages`,
      [cutoff]
    );
    if (!result.rows.length) return false;
    this.superAdminAgentSettings = normalizeSuperAdminAgentSettings({
      ...this.superAdminAgentSettings,
      messages: result.rows[0].messages,
    });
    this.connected = true;
    return true;
  }

  async loadSuperAdminAgentSettings(): Promise<SuperAdminAgentSettings> {
    await this.pruneSuperAdminAgentMessages();
    if (!this.pool && process.env.NODE_ENV !== 'production') {
      return normalizeSuperAdminAgentSettings(this.superAdminAgentSettings);
    }
    const result = await this.db().query(
      "SELECT secret_value FROM public.server_secrets WHERE secret_name='provider_config' LIMIT 1"
    );
    const settings = normalizeSuperAdminAgentSettings(result.rows[0]?.secret_value?.superAdminAgent);
    this.superAdminAgentSettings = settings;
    return normalizeSuperAdminAgentSettings(settings);
  }

  async saveSuperAdminAgentSettings(value: SuperAdminAgentSettings): Promise<SuperAdminAgentSettings> {
    const settings = normalizeSuperAdminAgentSettings(value);
    if (!this.pool && process.env.NODE_ENV !== 'production') {
      this.superAdminAgentSettings = settings;
      return normalizeSuperAdminAgentSettings(settings);
    }
    await this.db().query(
      `INSERT INTO public.server_secrets AS current_secrets (secret_name, secret_value, updated_at)
       VALUES ('provider_config', jsonb_build_object('superAdminAgent', $1::jsonb), NOW())
       ON CONFLICT (secret_name) DO UPDATE
       SET secret_value=COALESCE(current_secrets.secret_value, '{}'::jsonb) || EXCLUDED.secret_value,
           updated_at=NOW()`,
      [JSON.stringify(settings)]
    );
    this.superAdminAgentSettings = settings;
    this.connected = true;
    return normalizeSuperAdminAgentSettings(settings);
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
        else v={id:r.id,craftsmanId:r.craftsman_id,cityId:r.city_id,professionId:r.profession_id,purgedAt:date(r.purged_at),reason:r.reason};
        out[r.id]=v;
      }
      this.connected=true; return out;
    }
    const queries:Record<string,string> = {
      // Convert the custom enum array to JSON so node-postgres decodes it as a JS array.
      users:'SELECT id,phone,password_hash,array_to_json(roles) AS roles,status,created_at FROM public.users',
      craftsmen:"SELECT c.*,COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'craftsmanId',p.craftsman_id,'url',p.url,'displayOrder',p.display_order,'isPrimary',p.is_primary,'createdAt',p.created_at,'updatedAt',p.updated_at) ORDER BY p.display_order) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) photos FROM public.craftsmen c LEFT JOIN public.craftsman_photos p ON p.craftsman_id=c.id GROUP BY c.id",
      craftsmanDrafts:'SELECT * FROM public.craftsman_drafts',
      top15Prices:'SELECT * FROM public.top15_prices',
      top15Reservations:'SELECT * FROM public.top15_reservations',
      top15Memberships:'SELECT m.*,c.name_ka city_name,p.name_ka profession_name FROM public.top15_memberships m JOIN public.cities c ON c.id=m.city_id JOIN public.professions p ON p.id=m.profession_id',
      paymentIntents:'SELECT * FROM public.payment_intents',
      craftsmanListings:'SELECT * FROM public.craftsman_listings',
      advertisements:'SELECT * FROM public.advertisements',
    };
    const q=queries[name]; if(!q) throw new Error('Unsupported Supabase collection '+name);
    const rs=await this.db().query(q);
    for(const r of rs.rows) {
      let k=r.id,v:any;
      if(name==='users') v={id:r.id,phone:r.phone,password:r.password_hash,roles:r.roles,status:r.status,createdAt:date(r.created_at)};
      else if(name==='craftsmen') v={id:r.id,userId:r.user_id,name:r.name,description:r.description||'',phone:r.phone,phoneVisible:r.phone_visible,latitude:r.latitude==null?null:Number(r.latitude),longitude:r.longitude==null?null:Number(r.longitude),workingHours:r.working_hours,status:r.status,cityId:r.city_id,professionId:r.profession_id,bankAccount:r.bank_account,createdAt:date(r.created_at),updatedAt:date(r.updated_at),photos:r.photos||[]};
      else if(name==='craftsmanDrafts'){k=r.user_id;v={step:r.step,data:r.data||{},updatedAt:date(r.updated_at)};}
      else if(name==='top15Prices') v={cityId:r.city_id,professionId:r.profession_id,amountMinor:Number(r.amount_minor),currency:r.currency,updatedAt:date(r.updated_at),updatedBy:r.updated_by||'system'};
      else if(name==='top15Reservations') v={id:r.id,craftsmanId:r.craftsman_id,cityId:r.city_id,professionId:r.profession_id,amountMinor:Number(r.amount_minor),currency:r.currency,expiresAt:new Date(r.expires_at).getTime(),status:r.status==='CONFIRMED'?'PAID':r.status==='EXPIRED'?'EXPIRED':'HELD'};
      else if(name==='top15Memberships') v={id:r.id,craftsmanId:r.craftsman_id,cityId:r.city_id,cityName:r.city_name,professionId:r.profession_id,professionName:r.profession_name,startsAt:date(r.starts_at),expiresAt:date(r.expires_at),status:r.status==='ACTIVE'?'ACTIVE':'EXPIRED'};
      else if(name==='paymentIntents') v={id:r.id,reservationId:r.reservation_id,craftsmanId:r.craftsman_id,providerId:r.provider,amountMinor:Number(r.amount_minor),currency:r.currency,idempotencyKey:r.idempotency_key,status:r.status,createdAt:date(r.created_at)};
      else if(name==='craftsmanListings') v={id:r.id,craftsmanId:r.craftsman_id,cityId:r.city_id,professionId:r.profession_id,status:r.status,startsAt:r.starts_at?date(r.starts_at):null,expiresAt:r.expires_at?date(r.expires_at):null,graceEndsAt:r.grace_ends_at?date(r.grace_ends_at):null,lastPaymentId:r.last_payment_id,createdAt:date(r.created_at),updatedAt:date(r.updated_at)};
      else v={id:r.id,company_name:r.company_name,phone_number:r.phone_number,password:r.password,expires_at:date(r.expires_at),image_url:r.image_url||'',target_url:r.target_url||'',is_active:r.is_active,payment_status:r.payment_status,terms_accepted:r.terms_accepted,price_gel:Number(r.price_gel),days_duration:r.days_duration,created_at:date(r.created_at),updated_at:date(r.updated_at)};
      out[k]=v;
    }
    this.connected=true; return out;
  }

  async loadRuntimeArray<T=any>(name:string):Promise<T[]> {
    const map=await this.loadRuntimeCollection<T>('__array_'+name); return Object.keys(map).sort().map((k)=>map[k]);
  }

  async saveRuntimeCollection<T>(_name:string,_values:Map<string,T>):Promise<void> {
    throw new Error('Use transactional saveRuntimeState.');
  }
  async saveRuntimeArray<T>(_name:string,_values:T[]):Promise<void> {
    throw new Error('Use transactional saveRuntimeState.');
  }

  async saveRuntimeState(state:RuntimeState):Promise<void> {
    if (!this.pool && process.env.NODE_ENV !== 'production') return;
    const next=this.saveQueue.then(()=>this.persist(state)); this.saveQueue=next.catch(()=>undefined); return next;
  }

  private async persist(s:RuntimeState):Promise<void> {
    const client=await this.db().connect();
    const up=async(sql:string,args:any[])=>client.query(sql,args);
    const sync=async(table:string,key:string,ids:string[])=>client.query('DELETE FROM public.'+table+' WHERE NOT ('+key+'=ANY($1::text[]))',[ids]);
    try {
      await client.query('BEGIN');
      for(const x of s.users.values()) {
        if (!Array.isArray(x.roles)) throw new Error('User roles must be an array before persistence.');
        await up("INSERT INTO public.users(id,phone,password_hash,roles,status,created_at,updated_at) VALUES($1,$2,$3,$4::user_role[],$5::user_status,$6,NOW()) ON CONFLICT(id) DO UPDATE SET phone=EXCLUDED.phone,password_hash=EXCLUDED.password_hash,roles=EXCLUDED.roles,status=EXCLUDED.status,updated_at=NOW()",[x.id,x.phone,x.password||'',x.roles.filter((r)=>r!=='AI_ADMIN'),x.status,x.createdAt]);
      }
      await sync('users','id',[...s.users.keys()]);
      const photoIds:string[]=[];
      for(const x of s.craftsmen.values()){
        await up("INSERT INTO public.craftsmen(id,user_id,name,description,phone,phone_visible,city_id,profession_id,latitude,longitude,working_hours,status,bank_account,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::craftsman_status,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,name=EXCLUDED.name,description=EXCLUDED.description,phone=EXCLUDED.phone,phone_visible=EXCLUDED.phone_visible,city_id=EXCLUDED.city_id,profession_id=EXCLUDED.profession_id,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,working_hours=EXCLUDED.working_hours,status=EXCLUDED.status,bank_account=EXCLUDED.bank_account,updated_at=EXCLUDED.updated_at",[x.id,x.userId,x.name,x.description||'',x.phone,x.phoneVisible,x.cityId,x.professionId,x.latitude,x.longitude,JSON.stringify(x.workingHours||{}),x.status,x.bankAccount||null,x.createdAt,x.updatedAt]);
        for(const p of x.photos||[]){photoIds.push(p.id);await up("INSERT INTO public.craftsman_photos(id,craftsman_id,url,is_primary,display_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET craftsman_id=EXCLUDED.craftsman_id,url=EXCLUDED.url,is_primary=EXCLUDED.is_primary,display_order=EXCLUDED.display_order,updated_at=EXCLUDED.updated_at",[p.id,x.id,p.url,p.isPrimary,p.displayOrder,p.createdAt,p.updatedAt]);}
      }
      await sync('craftsmen','id',[...s.craftsmen.keys()]); await sync('craftsman_photos','id',photoIds);
      for(const [id,x] of s.craftsmanDrafts) await up("INSERT INTO public.craftsman_drafts(user_id,step,data,updated_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(user_id) DO UPDATE SET step=EXCLUDED.step,data=EXCLUDED.data,updated_at=EXCLUDED.updated_at",[id,x.step,JSON.stringify(x.data||{}),x.updatedAt]);
      await sync('craftsman_drafts','user_id',[...s.craftsmanDrafts.keys()]);
      for(const [id,x] of s.top15Prices) await up("INSERT INTO public.top15_prices(id,city_id,profession_id,amount_minor,currency,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET city_id=EXCLUDED.city_id,profession_id=EXCLUDED.profession_id,amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by",[id,x.cityId,x.professionId,x.amountMinor,x.currency,x.updatedAt,s.users.has(x.updatedBy)?x.updatedBy:null]);
      await sync('top15_prices','id',[...s.top15Prices.keys()]);
      for(const x of s.craftsmanListings.values()) await up("INSERT INTO public.craftsman_listings(id,craftsman_id,city_id,profession_id,status,starts_at,expires_at,grace_ends_at,last_payment_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5::craftsman_status,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET craftsman_id=EXCLUDED.craftsman_id,city_id=EXCLUDED.city_id,profession_id=EXCLUDED.profession_id,status=EXCLUDED.status,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,grace_ends_at=EXCLUDED.grace_ends_at,last_payment_id=EXCLUDED.last_payment_id,updated_at=EXCLUDED.updated_at",[x.id,x.craftsmanId,x.cityId,x.professionId,x.status,x.startsAt||null,x.expiresAt||null,x.graceEndsAt||null,x.lastPaymentId||null,x.createdAt,x.updatedAt]);
      await sync('craftsman_listings','id',[...s.craftsmanListings.keys()]);
      for(const x of s.top15Reservations.values()) await up("INSERT INTO public.top15_reservations(id,city_id,profession_id,craftsman_id,amount_minor,currency,reserved_at,expires_at,status) VALUES($1,$2,$3,$4,$5,$6,NOW(),to_timestamp($7/1000.0),$8::reservation_status) ON CONFLICT(id) DO UPDATE SET city_id=EXCLUDED.city_id,profession_id=EXCLUDED.profession_id,craftsman_id=EXCLUDED.craftsman_id,amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,expires_at=EXCLUDED.expires_at,status=EXCLUDED.status",[x.id,x.cityId,x.professionId,x.craftsmanId,x.amountMinor,x.currency,x.expiresAt,x.status==='PAID'?'CONFIRMED':x.status==='EXPIRED'?'EXPIRED':'PENDING']);
      await sync('top15_reservations','id',[...s.top15Reservations.keys()]);
      for(const x of s.top15Memberships.values()) await up("INSERT INTO public.top15_memberships(id,city_id,profession_id,craftsman_id,status,starts_at,expires_at,created_at) VALUES($1,$2,$3,$4,$5::membership_status,$6,$7,$6) ON CONFLICT(id) DO UPDATE SET city_id=EXCLUDED.city_id,profession_id=EXCLUDED.profession_id,craftsman_id=EXCLUDED.craftsman_id,status=EXCLUDED.status,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at",[x.id,x.cityId,x.professionId,x.craftsmanId,x.status,x.startsAt,x.expiresAt]);
      await sync('top15_memberships','id',[...s.top15Memberships.keys()]);
      for(const x of s.paymentIntents.values()) await up("INSERT INTO public.payment_intents(id,reservation_id,craftsman_id,provider,amount_minor,currency,idempotency_key,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::payment_status,$9,$9) ON CONFLICT(id) DO UPDATE SET reservation_id=EXCLUDED.reservation_id,craftsman_id=EXCLUDED.craftsman_id,provider=EXCLUDED.provider,amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,idempotency_key=EXCLUDED.idempotency_key,status=EXCLUDED.status,updated_at=NOW()",[x.id,x.reservationId||null,x.craftsmanId,x.providerId,x.amountMinor,x.currency,x.idempotencyKey,x.status,x.createdAt]);
      await sync('payment_intents','id',[...s.paymentIntents.keys()]);
      for(const x of s.advertisements.values()) await up("INSERT INTO public.advertisements(id,company_name,phone_number,password,expires_at,image_url,target_url,is_active,payment_status,terms_accepted,price_gel,days_duration,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name,phone_number=EXCLUDED.phone_number,password=EXCLUDED.password,expires_at=EXCLUDED.expires_at,image_url=EXCLUDED.image_url,target_url=EXCLUDED.target_url,is_active=EXCLUDED.is_active,payment_status=EXCLUDED.payment_status,terms_accepted=EXCLUDED.terms_accepted,price_gel=EXCLUDED.price_gel,days_duration=EXCLUDED.days_duration,updated_at=EXCLUDED.updated_at",[x.id,x.company_name,x.phone_number,x.password||'',x.expires_at,x.image_url||'',x.target_url||'',x.is_active,x.payment_status,x.terms_accepted,x.price_gel||0,x.days_duration||30,x.created_at,x.updated_at]);
      await sync('advertisements','id',[...s.advertisements.keys()]);
      await this.saveRows(client,'support_messages',s.supportMessages,(x)=>[x.id,x.craftsmanId,x.sender,x.body,x.flaggedForHuman,x.createdAt],"INSERT INTO public.support_messages(id,craftsman_id,sender,body,flagged_for_human,created_at) VALUES($1,$2,$3::chat_sender_type,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body,flagged_for_human=EXCLUDED.flagged_for_human");
      await this.saveRows(client,'ai_reports',s.aiReports,(x)=>[x.id,x.type,x.craftsmanId||null,x.craftsmanName||null,x.periodFrom||null,x.periodTo||null,JSON.stringify(x.content||{}),x.createdAt],"INSERT INTO public.ai_reports(id,report_type,craftsman_id,craftsman_name,period_from,period_to,content,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,report_type=EXCLUDED.report_type");
      await this.saveRows(client,'audit_logs',s.auditLog,(x)=>[x.id,x.actorType,x.actorId,x.action,x.targetType,x.targetId||null,x.reason||null,x.createdAt],"INSERT INTO public.audit_logs(id,actor_type,actor_id,action,target_type,target_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET action=EXCLUDED.action,reason=EXCLUDED.reason");
      await this.saveRows(client,'listing_purge_logs',s.listingPurgeLog,(x)=>[x.id,x.craftsmanId,x.cityId,x.professionId,x.purgedAt,x.reason],"INSERT INTO public.listing_purge_logs(id,craftsman_id,city_id,profession_id,purged_at,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET reason=EXCLUDED.reason");
      this.connected=true; this.connectionError=null; await client.query('COMMIT');
    } catch(e:any) { await client.query('ROLLBACK').catch(()=>undefined); this.connected=false; this.connectionError=e.message; throw e; }
    finally { client.release(); }
  }

  private async saveRows<T extends {id:string}>(client:PoolClient,table:string,rows:T[],values:(x:T)=>any[],sql:string):Promise<void> {
    for(const row of rows) await client.query(sql,values(row));
    await client.query('DELETE FROM public.'+table+' WHERE NOT (id=ANY($1::text[]))',[rows.map((x)=>x.id)]);
  }

  getStatus() { return { databaseConfigured:Boolean(this.pool), databaseConnected:this.connected }; }
  async close() { await this.pool?.end(); }
}

export const storage = new StorageService();

const superAdminAgentRetentionInterval = setInterval(() => {
  void storage.pruneSuperAdminAgentMessages().catch(() => {
    console.warn('[MASTER_BOY] Could not apply superadmin agent chat retention cleanup.');
  });
}, 60 * 60 * 1000);
superAdminAgentRetentionInterval.unref?.();

void storage.pruneSuperAdminAgentMessages().catch(() => {
  console.warn('[MASTER_BOY] Could not apply superadmin agent chat retention cleanup.');
});

