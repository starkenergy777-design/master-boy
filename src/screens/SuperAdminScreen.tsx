import { formatLocalizedDate, formatLocalizedTime, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import {
  Key,
  Lock,
  Unlock,
  ShieldAlert,
  Cpu,
  Building2,
  Smartphone,
  CheckCircle,
  AlertCircle,
  Link,
  CreditCard,
  Megaphone,
  Trash2,
  Plus,
  X,
  Eye,
  EyeOff,
  Settings2,
} from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User, Advertisement } from '../types.js';
import { api } from '../api.js';

const AgentMessageContent: React.FC<{ text: string }> = ({ text }) => <>{text}</>;

const superAdminAgentCopy = {
  ka: {
    title: 'სუპერადმინის აგენტი',
    description: 'დაავალე აგენტს მართვის მოქმედებები სუპერადმინის ავტორიზაციით. სუპერადმინის პაროლს აგენტი ვერ შეცვლის.',
    on: 'ჩართულია',
    off: 'გამორთულია',
    enable: 'აგენტის ჩართვა',
    disable: 'აგენტის გამორთვა',
    rules: 'აგენტისთვის სავალდებულო წესები',
    rulesHint: 'ჩაწერე, როგორ უნდა იმუშაოს აგენტმა. პაროლები და API გასაღებები აქ არ შეიყვანო.',
    reloadRules: 'შენახული წესების ხელახლა ჩატვირთვა',
    rulesReloaded: 'შენახული წესები ჩაიტვირთა.',
    saveRules: 'წესების შენახვა',
    rulesSaved: 'წესები შენახულია.',
    addRules: 'წესების დამატება',
    editRules: 'წესების კორექტირება',
    deleteRules: 'წესების წაშლა',
    confirmDeleteRules: 'წაშალო აგენტისთვის შენახული წესები?',
    rulesDeleted: 'აგენტის წესები წაიშალა.',
    noRules: 'წესები ჯერ არ არის შენახული.',
    cancel: 'გაუქმება',
    chat: 'ჩატი აგენტთან',
    chatHint: 'მოქმედებას მხოლოდ მაშინ შეასრულებს, როცა პირდაპირ დაავალებ. მაგალითად, საბანკო ანგარიშის შეცვლა.',
    placeholder: 'დაწერე დავალება...',
    send: 'გაგზავნა',
    waiting: 'ამუშავებს...',
    noMessages: 'ჩატი ჯერ ცარიელია.',
    chatRetention: 'ჩატის შეტყობინებები 7 დღის შემდეგ ავტომატურად იშლება.',
    clearChat: 'ჩატის ისტორიის წაშლა',
    confirmClearChat: 'წაიშალოს ჩატის მთელი ისტორია? ეს მოქმედება ვერ აღდგება.',
    chatDeleted: 'ჩატის ისტორია წაიშალა.',
    privacy: 'ყოველ შეტყობინებაზე აგენტი იღებს პანელის მიმდინარე შეჯამებას: ხელოსნების, ფასების, გადახდების, პროვაიდერებისა და სისტემის სტატუსს. საიდუმლო გასაღებები, პაროლები, IBAN-ები, საიდენტიფიკაციო ნომრები და ტელეფონის ნომრები შეჯამებაში არ შედის; ადმინისტრაციული API-ის პასუხებშიც მგრძნობიარე ველები იფარება. ჩატის ტექსტი და შეჯამება არჩეულ AI პროვაიდერს ეგზავნება. ჩატის ისტორია Supabase-ში ინახება და 7 დღის შემდეგ ავტომატურად იშლება; წესები ცალკე ინახება.',
    actions: 'შესრულებული მოქმედებები',
    loadFailed: 'აგენტის შენახული პარამეტრები ვერ ჩაიტვირთა.',
    failed: 'აგენტის მოთხოვნა ვერ შესრულდა.',
  },
  ru: {
    title: 'Агент суперадминистратора',
    description: 'Поручайте агенту действия с авторизацией суперадминистратора. Агент не может изменить пароль суперадминистратора.',
    on: 'Включён',
    off: 'Выключен',
    enable: 'Включить агента',
    disable: 'Выключить агента',
    rules: 'Обязательные правила для агента',
    rulesHint: 'Укажите, как агент должен работать. Не вводите здесь пароли и API-ключи.',
    reloadRules: 'Загрузить сохранённые правила',
    rulesReloaded: 'Сохранённые правила загружены.',
    saveRules: 'Сохранить правила',
    rulesSaved: 'Правила сохранены.',
    addRules: 'Добавить правила',
    editRules: 'Изменить правила',
    deleteRules: 'Удалить правила',
    confirmDeleteRules: 'Удалить сохранённые правила агента?',
    rulesDeleted: 'Правила агента удалены.',
    noRules: 'Правила ещё не сохранены.',
    cancel: 'Отмена',
    chat: 'Чат с агентом',
    chatHint: 'Агент действует только по вашему прямому поручению. Например, изменить банковский счёт.',
    placeholder: 'Напишите поручение...',
    send: 'Отправить',
    waiting: 'Обрабатывает...',
    noMessages: 'Чат пока пуст.',
    chatRetention: 'Сообщения чата автоматически удаляются через 7 дней.',
    clearChat: 'Удалить историю чата',
    confirmClearChat: 'Удалить всю историю чата? Это действие нельзя отменить.',
    chatDeleted: 'История чата удалена.',
    privacy: 'При каждом сообщении агент получает текущую сводку панели: мастера, цены, платежи, провайдеры и состояние системы. Сводка не содержит секретных ключей, паролей, IBAN, идентификационных номеров и телефонов; чувствительные поля также маскируются в ответах административного API. Текст чата и сводка передаются выбранному провайдеру ИИ. История чата хранится в Supabase и автоматически удаляется через 7 дней; правила хранятся отдельно.',
    actions: 'Выполненные действия',
    loadFailed: 'Не удалось загрузить сохранённые настройки агента.',
    failed: 'Не удалось выполнить запрос агенту.',
  },
  en: {
    title: 'Superadmin agent',
    description: 'Delegate admin tasks through the authenticated superadmin APIs. The agent cannot change the superadmin password.',
    on: 'Enabled',
    off: 'Disabled',
    enable: 'Enable agent',
    disable: 'Disable agent',
    rules: 'Mandatory agent rules',
    rulesHint: 'Set the agent’s operating rules. Do not enter passwords or API keys here.',
    reloadRules: 'Reload saved rules',
    rulesReloaded: 'Saved rules loaded.',
    saveRules: 'Save rules',
    rulesSaved: 'Rules saved.',
    addRules: 'Add rules',
    editRules: 'Edit rules',
    deleteRules: 'Delete rules',
    confirmDeleteRules: 'Delete the saved agent rules?',
    rulesDeleted: 'Agent rules deleted.',
    noRules: 'No rules have been saved yet.',
    cancel: 'Cancel',
    chat: 'Chat with agent',
    chatHint: 'The agent acts only on your direct instruction, such as updating the recipient bank account.',
    placeholder: 'Write a task...',
    send: 'Send',
    waiting: 'Working...',
    noMessages: 'The chat is empty.',
    chatRetention: 'Chat messages are automatically deleted after 7 days.',
    clearChat: 'Delete chat history',
    confirmClearChat: 'Delete the entire chat history? This cannot be undone.',
    chatDeleted: 'Chat history deleted.',
    privacy: 'Each message includes a live dashboard summary of craftsmen, prices, payments, providers, and system status. The snapshot excludes API keys, passwords, IBANs, tax IDs, and phone numbers; sensitive fields are also masked in admin API responses. Chat text and the summary go to the selected AI provider. Chat history is stored in Supabase and automatically deleted after 7 days; rules are stored separately.',
    actions: 'Actions performed',
    loadFailed: 'Could not load the saved agent settings.',
    failed: 'The agent request failed.',
  },
} as const;

interface SuperAdminScreenProps {
  lang: Language;
  currentUser: User;
  onBack: () => void;
  onOpenAdminTools: () => void;
}

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = ({
  lang,
  currentUser,
  onBack,
  onOpenAdminTools,
}) => {
  const t = translations[lang] || translations.ka;
  const adminCopy = ({
    ka: {
      title: 'ადმინისტრატორების მართვა',
      description: 'შექმენი ადმინისტრატორის ანგარიში, მიუთითე უნიკალური ტელეფონის ნომერი და კომპანიის წილში მისი პროცენტი.',
      create: 'ადმინისტრატორის შექმნა', hide: 'ფორმის დახურვა', phone: 'ტელეფონის ნომერი',
      password: 'პაროლი (მინიმუმ 12 სიმბოლო)', share: 'კომპანიის წილი (%)', save: 'შენახვა', cancel: 'გაუქმება',
      empty: 'ადმინისტრატორები ჯერ არ არის დამატებული.',
      locked: 'კონფიგურაციის ჩაკეტვის დროს ადმინისტრატორის შექმნა მიუწვდომელია.',
      created: 'ადმინისტრატორის ანგარიში წარმატებით შეიქმნა.',
      duplicate: 'ამ ტელეფონის ნომრით ანგარიში უკვე არსებობს. გამოიყენე სხვა ნომერი.',
      loadFailed: 'ადმინისტრატორების სია ვერ ჩაიტვირთა.',
      createFailed: 'ადმინისტრატორის შექმნა ვერ მოხერხდა.',
      invalidShare: 'წილი მიუთითე 0-დან 100-მდე, მაქსიმუმ ორი ათწილადი ნიშნით.',
      assignedShare: 'კომპანიის შენთვის მინიჭებული წილი', notAssigned: 'წილი მინიჭებული არ არის', admins: 'ადმინისტრატორები',
    },
    ru: {
      title: 'Управление администраторами',
      description: 'Создайте учетную запись администратора, укажите уникальный номер телефона и его долю в компании.',
      create: 'Создать администратора', hide: 'Закрыть форму', phone: 'Номер телефона',
      password: 'Пароль (не менее 12 символов)', share: 'Доля компании (%)', save: 'Сохранить', cancel: 'Отмена',
      empty: 'Администраторы пока не добавлены.',
      locked: 'Создание администратора недоступно, пока настройки заблокированы.',
      created: 'Учетная запись администратора создана.',
      duplicate: 'Учетная запись с таким номером телефона уже существует. Укажите другой номер.',
      loadFailed: 'Не удалось загрузить список администраторов.',
      createFailed: 'Не удалось создать администратора.',
      invalidShare: 'Укажите долю от 0 до 100, максимум с двумя знаками после запятой.',
      assignedShare: 'Назначенная вам доля компании', notAssigned: 'Доля не назначена', admins: 'Администраторы',
    },
    en: {
      title: 'Administrator management',
      description: 'Create an administrator account with a unique phone number and its percentage share of the company.',
      create: 'Create administrator', hide: 'Close form', phone: 'Phone number',
      password: 'Password (at least 12 characters)', share: 'Company share (%)', save: 'Save', cancel: 'Cancel',
      empty: 'No administrators have been added yet.',
      locked: 'Administrator creation is unavailable while configuration is locked.',
      created: 'Administrator account created successfully.',
      duplicate: 'An account with this phone number already exists. Use another number.',
      loadFailed: 'Could not load the administrator list.',
      createFailed: 'Could not create the administrator account.',
      invalidShare: 'Enter a share from 0 to 100 with up to two decimal places.',
      assignedShare: 'Your assigned company share', notAssigned: 'No share assigned', admins: 'Administrators',
    },
  } as const)[lang];

  const aiCopy = {
    ka: {
      title: 'AI პროვაიდერი',
      description: 'აირჩიე AI პროვაიდერი. მისი API გასაღები ინახება მხოლოდ სერვერზე და უკან არ ბრუნდება.',
      active: 'არჩეული',
      ready: 'გასაღები დამატებულია',
      missing: 'გასაღები არ არის',
      provider: 'AI პროვაიდერი',
      chooseProvider: 'ჯერ აირჩიე AI პროვაიდერი.',
      key: 'API გასაღები',
      placeholder: 'ჩასვი გასაღები — შენახვის შემდეგ ველი გასუფთავდება',
      save: 'გასაღების შენახვა / პროვაიდერის არჩევა',
      saved: 'AI პროვაიდერი შემოწმდა და პარამეტრები Supabase-ში უსაფრთხოდ შეინახა.',
      savedUnverified: 'API გასაღები დაცულად შეინახა, მაგრამ პროვაიდერთან კავშირის შემოწმება დროებით ვერ დასრულდა. გასაღები ცალკეა შენახული; მისი გამოყენებისთვის პროვაიდერი აირჩიე.',
      selected: 'შენახული პროვაიდერი არჩეულია. ჩატი ამ პროვაიდერის ცალკე შენახულ გასაღებს გამოიყენებს.',
      required: 'არჩეული პროვაიდერის API გასაღები ჯერ უნდა დაამატო.',
      invalid: 'გასაღები უარყოფილია. გადაამოწმე მისი სისწორე და შერჩეულ მოდელზე წვდომა.',
      saveFailed: 'AI პარამეტრები ვერ შეინახა. გადაამოწმე მონაცემთა ბაზის განახლება.',
      adminTools: 'ადმინისტრირების ინსტრუმენტები',
      note: 'ორივე მხარდაჭერილი AI პროვაიდერი გამოდგება ხელოსნების მხარდაჭერის ჩატისა და მოთხოვნისამებრ ანგარიშების მოსამზადებლად.',
      processing: 'მხარდაჭერის შეტყობინებები დასამუშავებლად არჩეულ AI პროვაიდერს ეგზავნება.',
      billing: 'OpenAI API-ის გამოყენების საფასური ChatGPT-ის გამოწერისგან ცალკეა.'
    },
    ru: {
      title: 'Провайдер ИИ',
      description: 'Выберите провайдера ИИ. API-ключ хранится только на сервере и не возвращается.',
      active: 'Выбран',
      ready: 'Ключ добавлен',
      missing: 'Ключ не добавлен',
      provider: 'Провайдер ИИ',
      chooseProvider: 'Сначала выберите провайдера ИИ.',
      key: 'API-ключ',
      placeholder: 'Вставьте ключ — поле очистится после сохранения',
      save: 'Сохранить ключ / выбрать провайдера',
      saved: 'Провайдер ИИ проверен, настройки безопасно сохранены в Supabase.',
      savedUnverified: 'API-ключ сохранён безопасно, но временно не удалось проверить подключение к провайдеру. Ключ сохранён отдельно; выберите провайдера, чтобы использовать его.',
      selected: 'Сохранённый провайдер выбран. Чат будет использовать его отдельный API-ключ.',
      required: 'Сначала добавьте API-ключ выбранного провайдера.',
      invalid: 'Ключ отклонён. Проверьте его и доступ к выбранной модели.',
      saveFailed: 'Не удалось сохранить настройки ИИ. Проверьте обновление базы данных.',
      adminTools: 'Инструменты администрирования',
      note: 'Оба поддерживаемых провайдера ИИ подходят для чата поддержки мастеров и подготовки отчётов по запросу.',
      processing: 'Сообщения поддержки отправляются выбранному провайдеру ИИ для обработки.',
      billing: 'Использование OpenAI API оплачивается отдельно от подписки ChatGPT.'
    },
    en: {
      title: 'AI provider',
      description: 'Choose an AI provider. Its API key stays on the server and is never returned.',
      active: 'Selected',
      ready: 'Key configured',
      missing: 'Key not set',
      provider: 'AI provider',
      chooseProvider: 'Choose an AI provider first.',
      key: 'API key',
      placeholder: 'Paste the key; this field clears after saving',
      save: 'Save key / select provider',
      saved: 'AI provider verified and settings saved securely in Supabase.',
      savedUnverified: 'The API key was saved securely, but the provider could not be checked right now. The key is stored separately; select that provider to use it.',
      selected: 'The saved provider is selected. The chat will use its separately stored API key.',
      required: 'Add an API key for the selected provider first.',
      invalid: 'The API key was rejected. Check that it is valid and has access to the selected model.',
      saveFailed: 'AI settings could not be saved. Check the database migration and try again.',
      adminTools: 'Administration tools',
      note: 'Both supported AI providers can power craftsman support chat and prepare reports when requested. Choose the option you prefer.',
      processing: 'Support messages are sent to the selected AI provider for processing.',
      billing: 'OpenAI API usage is billed separately from a ChatGPT subscription.'
    },
  }[lang] || {
    title: 'AI provider', description: 'Choose an AI provider. Its API key stays on the server and is never returned.',
    active: 'Selected', ready: 'Key configured', missing: 'Key not set', provider: 'AI provider', chooseProvider: 'Choose an AI provider first.',
    key: 'API key', placeholder: 'Paste the key; this field clears after saving', save: 'Verify and save',
    saved: 'AI provider verified and settings saved securely in Supabase.', required: 'Add an API key for the selected provider first.',
    adminTools: 'Administration tools', note: 'Both supported AI providers are available.',
    billing: 'OpenAI API usage is billed separately from a ChatGPT subscription.',
    processing: 'Support messages are sent to the selected AI provider for processing.',
  };

  // AI provider state. API keys are write-only and never restored to the browser.
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiModelInput, setAiModelInput] = useState('');
  const [selectedAIProvider, setSelectedAIProvider] = useState<'gemini' | 'openai' | ''>('');
  const [geminiStatus, setGeminiStatus] = useState<any>(null);

  const [agentConfig, setAgentConfig] = useState<{ enabled: boolean; rules: string; messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }> }>({
    enabled: false,
    rules: '',
    messages: [],
  });
  const [agentRulesDraft, setAgentRulesDraft] = useState('');
  const [agentRulesEditing, setAgentRulesEditing] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentNotice, setAgentNotice] = useState('');
  const [agentActions, setAgentActions] = useState<Array<{ success: boolean; status: number; method: string; path: string; purpose?: string }>>([]);

  // Recipient Account State (§3.5)
  const [recipient, setRecipient] = useState<any>({ iban: '', bankName: '', beneficiary: '' });

  // Config Lock State (§3.5)
  const [configLock, setConfigLock] = useState<any>({ locked: false, lockedUntil: null });
  const [unlockCredential, setUnlockCredential] = useState('');

  // Bootstrap Migration State (§16.3)
  const [bootstrapStatus, setBootstrapStatus] = useState<any>(null);
  const [newPhone, setNewPhone] = useState('+995599001122');
  const [newPassword, setNewPassword] = useState('');
  const [bootstrapOtp, setBootstrapOtp] = useState('');

  // Backend Config (§16.4)
  const [backendConfig, setBackendConfig] = useState<any>(null);

  // Craftsman Listing Price (§6.6, R-25)
  const [listingPrice, setListingPrice] = useState<{ amountMinor: number; currency: string }>({ amountMinor: 1000, currency: 'GEL' });
  const [newListingPriceGEL, setNewListingPriceGEL] = useState('10');

  // Payment Providers State (Bank of Georgia, TBC Bank, Stripe)
  const [paymentProviders, setPaymentProviders] = useState<any[]>([]);
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [providerForm, setProviderForm] = useState({
    clientId: '',
    secretKey: '',
    apiKey: '',
    webhookSecret: '',
    isActive: false,
  });
  const [showKeyMask, setShowKeyMask] = useState(false);

  // Commercial Advertisements (§Task 10)
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [showCreateAdModal, setShowCreateAdModal] = useState(false);
  const [deleteConfirmAd, setDeleteConfirmAd] = useState<Advertisement | null>(null);
  const [newAdCompany, setNewAdCompany] = useState('');
  const [newAdPhone, setNewAdPhone] = useState('+9955');
  const [newAdPassword, setNewAdPassword] = useState('');
  const [newAdDays, setNewAdDays] = useState('30');
  const [newAdPrice, setNewAdPrice] = useState('50');

  const [persistenceStatus, setPersistenceStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showLockConfirmModal, setShowLockConfirmModal] = useState(false);
  const [managedAdmins, setManagedAdmins] = useState<User[]>([]);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminSharePercent, setNewAdminSharePercent] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminNotice, setAdminNotice] = useState('');

  const loadAll = async () => {
    try {
      setLoading(true);
      const [aiStat, recStat, lockStat, bootStat, backStat, listPriceStat, provStat, adsStat, persistStat, agentStat, adminsStat] = await Promise.all([
        api.getAiProviderStatus(),
        api.getRecipientAccount(),
        api.getConfigLock(),
        api.getBootstrapStatus(),
        api.getBackendConfig(),
        api.getListingPrice().catch(() => null),
        api.getProviders('payment').catch(() => []),
        api.getAdminAds().catch(() => []),
        api.getPersistenceStatus().catch(() => null),
        api.getSuperAdminAgent().catch(() => null),
        api.getAdmins().catch(() => null),
      ]);
      setGeminiStatus(aiStat);
      if (agentStat) {
        setAgentConfig(agentStat);
        setAgentRulesDraft(agentStat.rules || '');
        setAgentRulesEditing(false);
      } else {
        setAgentError(superAdminAgentCopy[lang].loadFailed);
      }
      setSelectedAIProvider(aiStat.selectedProvider === 'openai' || aiStat.selectedProvider === 'gemini' ? aiStat.selectedProvider : '');
      setAiModelInput(aiStat.selectedProvider === 'gemini' ? (aiStat.geminiModel || '') : (aiStat.openaiModel || ''));
      setRecipient(recStat);
      setConfigLock(lockStat);
      setBootstrapStatus(bootStat);
      setBackendConfig(backStat);
      setPersistenceStatus(persistStat);
      if (listPriceStat) {
        setListingPrice(listPriceStat);
        setNewListingPriceGEL((listPriceStat.amountMinor / 100).toString());
      }
      setPaymentProviders(provStat || []);
      setAds(adsStat || []);
      if (adminsStat) {
        setManagedAdmins(adminsStat);
        setAdminError('');
      } else {
        setAdminError(adminCopy.loadFailed);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const cleanupExpiredChatMessages = () => {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      setAgentConfig(current => {
        const messages = current.messages.filter(message => {
          const createdAt = Date.parse(message.createdAt);
          return Number.isFinite(createdAt) && createdAt >= cutoff;
        });
        return messages.length === current.messages.length ? current : { ...current, messages };
      });
    };
    const timer = window.setInterval(cleanupExpiredChatMessages, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleAiProviderChange = async (provider: 'gemini' | 'openai' | '') => {
    const previousProvider = geminiStatus?.selectedProvider || '';
    setSelectedAIProvider(provider);
    setAiKeyInput('');
    setAiModelInput(provider === 'gemini' ? (geminiStatus?.geminiModel || '') : provider === 'openai' ? (geminiStatus?.openaiModel || '') : '');
    setErrorMsg('');
    setSuccessMsg('');
    if (!provider || provider === previousProvider) return;

    const hasProviderKey = provider === 'gemini'
      ? geminiStatus?.geminiConfigured
      : geminiStatus?.openaiConfigured;
    if (!hasProviderKey) return;

    try {
      setLoading(true);
      const updated = await api.updateAiProvider(provider);
      setGeminiStatus(updated);
      setSelectedAIProvider(updated.selectedProvider || provider);
      setSuccessMsg(aiCopy.selected);
    } catch (err: any) {
      setSelectedAIProvider(previousProvider);
      setErrorMsg(err.message || aiCopy.invalid);
    } finally {
      setLoading(false);
    }
  };

  // Save the selected provider's key, or activate its separately saved key.
  const handleSaveAiProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAIProvider) {
      setErrorMsg(aiCopy.chooseProvider);
      return;
    }
    const hasSelectedKey = selectedAIProvider === 'gemini'
      ? geminiStatus?.geminiConfigured
      : geminiStatus?.openaiConfigured;
    if (!aiKeyInput.trim() && !hasSelectedKey) {
      setErrorMsg(aiCopy.required);
      return;
    }
    if (!aiModelInput.trim()) {
      setErrorMsg(lang === 'ka' ? 'აირჩიეთ ან ჩაწერეთ AI მოდელის იდენტიფიკატორი.' : lang === 'ru' ? 'Укажите модель ИИ.' : 'Enter an AI model identifier.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const res = await api.updateAiProvider(selectedAIProvider, aiKeyInput.trim() || undefined, aiModelInput.trim());
      setGeminiStatus(res);
      setAiKeyInput('');
      if (res.providerVerified) {
        setSelectedAIProvider(res.selectedProvider || selectedAIProvider);
        setSuccessMsg(aiCopy.saved);
      } else if (res.keySaved && !res.providerSelected) {
        setSelectedAIProvider(res.selectedProvider || '');
        setSuccessMsg(aiCopy.savedUnverified);
      } else {
        setSelectedAIProvider(res.selectedProvider || selectedAIProvider);
        setSuccessMsg(aiCopy.selected);
      }
    } catch (err: any) {
      const errorCode = err.code || err.data?.code;
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot modify AI settings during the configuration lock.');
      } else if (errorCode === 'AI_SETTINGS_PERSIST_FAILED') {
        setErrorMsg(aiCopy.saveFailed);
      } else {
        setErrorMsg(err.message || aiCopy.invalid);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAgent = async () => {
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      const updated = await api.updateSuperAdminAgent({ enabled: !agentConfig.enabled }) as typeof agentConfig;
      setAgentConfig(updated);
      setAgentNotice(updated.enabled ? superAdminAgentCopy[lang].on : superAdminAgentCopy[lang].off);
    } catch (err: any) {
      setAgentError(err.message || superAdminAgentCopy[lang].failed);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleReloadAgentRules = async () => {
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      const saved = await api.getSuperAdminAgent() as typeof agentConfig;
      setAgentConfig(saved);
      setAgentRulesDraft(saved.rules || '');
      setAgentRulesEditing(false);
      setAgentNotice(superAdminAgentCopy[lang].rulesReloaded);
    } catch (err: any) {
      setAgentError(err.message || superAdminAgentCopy[lang].loadFailed);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSaveAgentRules = async () => {
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      const updated = await api.updateSuperAdminAgent({ rules: agentRulesDraft }) as typeof agentConfig;
      setAgentConfig(updated);
      setAgentRulesDraft(updated.rules || '');
      setAgentRulesEditing(false);
      setAgentNotice(superAdminAgentCopy[lang].rulesSaved);
    } catch (err: any) {
      setAgentError(err.message || superAdminAgentCopy[lang].failed);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleDeleteAgentRules = async () => {
    if (!window.confirm(superAdminAgentCopy[lang].confirmDeleteRules)) return;
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      const updated = await api.updateSuperAdminAgent({ rules: '' }) as typeof agentConfig;
      setAgentConfig(updated);
      setAgentRulesDraft('');
      setAgentRulesEditing(false);
      setAgentNotice(superAdminAgentCopy[lang].rulesDeleted);
    } catch (err: any) {
      setAgentError(err.message || superAdminAgentCopy[lang].failed);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleClearAgentChat = async () => {
    if (!agentConfig.messages.length || !window.confirm(superAdminAgentCopy[lang].confirmClearChat)) return;
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      await api.clearSuperAdminAgentChat();
      setAgentConfig(current => ({ ...current, messages: [] }));
      setAgentActions([]);
      setAgentInput('');
      setAgentNotice(superAdminAgentCopy[lang].chatDeleted);
    } catch (err: any) {
      setAgentError(err.message || superAdminAgentCopy[lang].failed);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleAgentChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = agentInput.trim();
    if (!text || !agentConfig.enabled || agentBusy || agentRulesEditing) return;
    setAgentError('');
    setAgentNotice('');
    try {
      setAgentBusy(true);
      const updated: any = await api.sendSuperAdminAgentMessage(text);
      setAgentConfig({ enabled: updated.enabled, rules: updated.rules || '', messages: updated.messages || [] });
      setAgentActions(updated.actions || []);
      setAgentInput('');
    } catch (err: any) {
      if (Array.isArray(err.data?.messages)) {
        setAgentConfig((current) => ({ ...current, messages: err.data.messages }));
        setAgentInput('');
      }
      if (Array.isArray(err.data?.actions)) setAgentActions(err.data.actions);
      setAgentError(err.message || superAdminAgentCopy[lang].failed);
    } finally {
      setAgentBusy(false);
    }
  };

  // Update Recipient Account
  const handleUpdateRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      await api.updateRecipientAccount(recipient);
      setSuccessMsg('Recipient company account updated.');
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Recipient account locked.');
      } else {
        setErrorMsg(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Activate 6-Month Config Lock (§3.5)
  const executeActivateLock = async () => {
    setShowLockConfirmModal(false);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const res = await api.activateConfigLock();
      setConfigLock(res);
      setSuccessMsg(lang === 'ka'
        ? 'კონფიგურაცია 6 თვით ჩაიკეტა. აპი არჩეულ AI პროვაიდერზე იმუშავებს.'
        : lang === 'ru'
          ? 'Настройки заблокированы на 6 месяцев. Приложение будет использовать выбранный провайдер ИИ.'
          : 'Configuration locked for 6 months. The app will use the selected AI provider.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Unlock with credential
  const handleUnlock = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const res = await api.unlockConfig(unlockCredential);
      setConfigLock(res);
      setUnlockCredential('');
      setSuccessMsg('Configuration successfully unlocked.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Bootstrap Migration (§16.3)
  const handleMigrateBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      await api.migrateBootstrap(newPhone, newPassword, bootstrapOtp);
      setSuccessMsg('Bootstrap disabled forever! Super Admin credentials finalized.');
      loadAll();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Listing Subscription Price (§6.6, R-25)
  const handleUpdateListingPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const val = parseFloat(newListingPriceGEL);
      if (!Number.isFinite(val) || val < 0) {
        setErrorMsg('Enter a valid price of 0 GEL or more');
        return;
      }
      const res = await api.updateListingPrice(Math.round(val * 100));
      setListingPrice(res);
      setSuccessMsg(`Listing subscription price updated to ${val} GEL.`);
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot modify listing price during 6-month lock.');
      } else {
        setErrorMsg(err.message || 'Failed to update listing price');
      }
    } finally {
      setLoading(false);
    }
  };

  // Payment Providers Handlers (Bank of Georgia, TBC, Stripe)
  const handleOpenEditProvider = (prov: any) => {
    setEditingProvider(prov);
    setProviderForm({
      clientId: prov.clientId || '',
      // Secret values are never returned by the API; blank means keep the saved value.
      secretKey: '',
      apiKey: '',
      webhookSecret: '',
      isActive: prov.isActive,
    });
    setShowKeyMask(false);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      await api.updatePaymentProvider(editingProvider.id, providerForm);
      setSuccessMsg(`საგადახდო პროვაიდერი „${editingProvider.name}“ წარმატებით განახლდა!`);
      setEditingProvider(null);
      const updated = await api.getProviders('payment');
      setPaymentProviders(updated);
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot modify payment providers during 6-month lock.');
      } else {
        setErrorMsg(err.message || 'პროვაიდერის განახლება ვერ მოხერხდა');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleProviderActive = async (prov: any) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const newActive = !prov.isActive;
      await api.updatePaymentProvider(prov.id, { isActive: newActive });
      setSuccessMsg(`${prov.name} ${newActive ? 'გააქტიურდა' : 'დეაქტივირდა'}!`);
      const updated = await api.getProviders('payment');
      setPaymentProviders(updated);
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot toggle provider during lock.');
      } else {
        setErrorMsg(err.message || 'სტატუსის შეცვლა ვერ მოხერხდა');
      }
    } finally {
      setLoading(false);
    }
  };

  // Advertisements Handlers (§Task 10)
  const handleBlockAndDeleteAd = async (adId: string) => {
    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      await api.blockAndDeleteAdminAd(adId);
      setSuccessMsg('სარეკლამო ბანერი წაიშალა და პარტნიორის ანგარიში დაიბლოკა!');
      loadAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'წაშლა და დაბლოკვა ვერ მოხერხდა');
    } finally {
      setLoading(false);
      setDeleteConfirmAd(null);
    }
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      await api.createAdminAd({
        company_name: newAdCompany.trim(),
        phone_number: newAdPhone.trim(),
        password: newAdPassword.trim(),
        days: parseInt(newAdDays || '30', 10),
        price_gel: parseFloat(newAdPrice || '50'),
      });
      setSuccessMsg('სარეკლამო პარტნიორი წარმატებით შეიქმნა!');
      setNewAdCompany('');
      setNewAdPhone('+9955');
      setNewAdPassword('');
      setShowCreateAdModal(false);
      loadAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'შექმნა ვერ მოხერხდა');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminNotice('');
    const sharePercent = Number(newAdminSharePercent);
    const shareCents = Math.round(sharePercent * 100);
    if (!Number.isFinite(sharePercent) || sharePercent < 0 || sharePercent > 100 || Math.abs(sharePercent * 100 - shareCents) > 1e-7) {
      setAdminError(adminCopy.invalidShare);
      return;
    }

    try {
      setAdminSaving(true);
      const createdAdmin = await api.createAdmin({
        phone: newAdminPhone.trim(),
        password: newAdminPassword,
        adminSharePercent: sharePercent,
      });
      setManagedAdmins(current => [...current.filter(admin => admin.id !== createdAdmin.id), createdAdmin]);
      setNewAdminPhone('');
      setNewAdminPassword('');
      setNewAdminSharePercent('');
      setShowCreateAdmin(false);
      setAdminNotice(adminCopy.created);
    } catch (err: any) {
      setAdminError(err.status === 409 ? adminCopy.duplicate : err.status === 423 ? adminCopy.locked : adminCopy.createFailed);
    } finally {
      setAdminSaving(false);
    }
  };

  return localizeTree(lang, (
    <div className="superadmin-dashboard relative isolate mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-4 pb-24 pt-5 text-slate-100 animate-fade-in sm:gap-6 lg:px-6">
      {/* Cabinet identity and service overview */}
      <header className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.13),_transparent_46%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(17,24,39,0.96)_58%,_rgba(30,27,75,0.82))] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.35)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-cyan-300/10" />
        <div className="pointer-events-none absolute right-8 top-8 h-32 w-32 rounded-full bg-cyan-400/5 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-inner shadow-cyan-100/5">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  <span>{t.superAdminCabinet}</span>
                </h2>
                <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-violet-200">
                  SUPER_ADMIN
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                {lang === 'ka' ? 'სისტემის მართვა • უსაფრთხოება • ინტეგრაციები' : lang === 'ru' ? 'Система • безопасность • интеграции' : 'System control • security • integrations'}
              </p>
            </div>
          </div>
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${configLock.locked ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'}`}>
                {configLock.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                {configLock.locked ? (lang === 'ka' ? 'ჩაკეტილია' : lang === 'ru' ? 'Заблокировано' : 'Locked') : (lang === 'ka' ? 'ღიაა' : lang === 'ru' ? 'Открыто' : 'Unlocked')}
              </span>
              <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${geminiStatus?.configured ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100' : 'border-slate-600 bg-slate-800/70 text-slate-300'}`}>
                <Cpu className="h-3.5 w-3.5" />
                AI · {geminiStatus?.configured ? aiCopy.ready : aiCopy.missing}
              </span>
              {persistenceStatus && (
                <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${persistenceStatus.databaseConnected ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-rose-400/25 bg-rose-400/10 text-rose-200'}`}>
                  <CheckCircle className="h-3.5 w-3.5" />
                  DB · {persistenceStatus.databaseConnected ? t.databaseConnected : t.databaseDisconnected}
                </span>
              )}
            </div>
            <button
              onClick={onOpenAdminTools}
              className="min-h-10 shrink-0 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-300/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              {aiCopy.adminTools}
            </button>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      <section className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white">{adminCopy.title}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">{adminCopy.description}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateAdmin(current => !current);
              setAdminError('');
              setAdminNotice('');
            }}
            disabled={configLock.locked || adminSaving}
            className="min-h-10 shrink-0 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showCreateAdmin ? adminCopy.hide : adminCopy.create}
          </button>
        </div>

        {configLock.locked && <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">{adminCopy.locked}</p>}
        {adminError && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">{adminError}</p>}
        {adminNotice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">{adminNotice}</p>}

        {showCreateAdmin && (
          <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4 md:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-slate-300">
              <span>{adminCopy.phone}</span>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={newAdminPhone}
                onChange={event => setNewAdminPhone(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-300">
              <span>{adminCopy.password}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newAdminPassword}
                onChange={event => setNewAdminPassword(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-300 md:col-span-2">
              <span>{adminCopy.share}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={newAdminSharePercent}
                onChange={event => setNewAdminSharePercent(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300 md:max-w-xs"
              />
            </label>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button
                type="submit"
                disabled={adminSaving || configLock.locked}
                className="min-h-10 rounded-xl bg-cyan-300 px-5 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adminSaving ? '…' : adminCopy.save}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateAdmin(false)}
                disabled={adminSaving}
                className="min-h-10 rounded-xl border border-slate-600 px-5 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {adminCopy.cancel}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{adminCopy.admins} ({managedAdmins.length})</h4>
          {managedAdmins.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 text-xs text-slate-500">{adminCopy.empty}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {managedAdmins.map(admin => (
                <div key={admin.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-slate-200">{admin.phone}</span>
                  <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1 text-xs font-bold text-cyan-100">
                    {typeof admin.adminSharePercent === 'number' ? String(admin.adminSharePercent) + '%' : adminCopy.notAssigned}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      {/* 1. Configuration Lock (§3.5 & §3.6) */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl border ${configLock.locked ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
              {configLock.locked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">{t.lockStatus}</h3>
              <p className="text-[10px] text-slate-400">
                {configLock.locked ? `Locked until ${formatLocalizedDate(lang, configLock.lockedUntil)}` : 'Unlocked (Config edits allowed)'}
              </p>
            </div>
          </div>
        </div>

        {configLock.locked ? (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <p className="text-[11px] text-amber-300">
              {lang === 'ka' ? 'ავტონომიური რეჟიმი ჩართულია. ჩატი და ანგარიშები იყენებს არჩეულ AI პროვაიდერს. პარამეტრების ცვლილება დაბლოკილია.' : lang === 'ru' ? 'Автономный режим включён. Чат и отчёты используют выбранный провайдер ИИ. Изменение настроек заблокировано.' : 'Autonomous mode is active. Chat and reports use the selected AI provider. Configuration edits are locked.'}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={unlockCredential}
                onChange={(e) => setUnlockCredential(e.target.value)}
                placeholder="Emergency Unlock Credential"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleUnlock}
                className="bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold px-3 py-2 rounded-xl text-xs border border-slate-700 shrink-0"
              >
                Unlock
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLockConfirmModal(true)}
            disabled={loading || !geminiStatus?.configured}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow disabled:opacity-50"
          >
            {t.activateLock}
          </button>
        )}
      </div>

      {/* 2. AI provider setup: Gemini and OpenAI */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">{aiCopy.title}</h3>
              <p className="text-[10px] text-slate-400">{aiCopy.description}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${geminiStatus?.configured ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
            {geminiStatus?.configured ? aiCopy.ready : aiCopy.missing}
          </span>
        </div>

        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3 text-[11px] text-indigo-300 space-y-2">
          <p className="font-semibold text-white">{aiCopy.note}</p>
          <p className="text-[10px] text-slate-300">{aiCopy.billing}</p>
          <p className="text-[10px] text-slate-400">{aiCopy.processing}</p>
          <div className="flex flex-wrap gap-2">
            <span className={`text-[10px] rounded-full border px-2 py-1 ${geminiStatus?.geminiConfigured ? 'text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-slate-700'}`}>
              Gemini: {geminiStatus?.geminiConfigured ? aiCopy.ready : aiCopy.missing}
            </span>
            <span className={`text-[10px] rounded-full border px-2 py-1 ${geminiStatus?.openaiConfigured ? 'text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-slate-700'}`}>
              OpenAI: {geminiStatus?.openaiConfigured ? aiCopy.ready : aiCopy.missing}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 pt-1 text-[10px]">
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-300 underline underline-offset-2">Google AI Studio — Gemini key</a>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-indigo-300 underline underline-offset-2">OpenAI Platform — API key</a>
          </div>
        </div>

        <form onSubmit={handleSaveAiProvider} className="space-y-2.5 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">{aiCopy.provider}</label>
            <select
              disabled={loading || configLock.locked}
              value={selectedAIProvider}
              onChange={(e) => { void handleAiProviderChange(e.target.value as 'gemini' | 'openai' | ''); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="" disabled>{aiCopy.chooseProvider}</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI (ChatGPT API)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">{selectedAIProvider === 'gemini' ? 'Gemini' : selectedAIProvider === 'openai' ? 'OpenAI (ChatGPT API)' : aiCopy.key}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder={aiCopy.placeholder}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
              required={selectedAIProvider === 'gemini' ? !geminiStatus?.geminiConfigured : selectedAIProvider === 'openai' ? !geminiStatus?.openaiConfigured : false}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">{lang === 'ka' ? 'AI მოდელი' : lang === 'ru' ? 'Модель ИИ' : 'AI model'}</label>
            <input
              type="text"
              autoComplete="off"
              value={aiModelInput}
              onChange={(e) => setAiModelInput(e.target.value)}
              placeholder={lang === 'ka' ? 'მოდელის იდენტიფიკატორი' : lang === 'ru' ? 'Идентификатор модели' : 'Model identifier'}
              maxLength={128}
              required
              disabled={loading || configLock.locked || !selectedAIProvider}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading || configLock.locked || !selectedAIProvider}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs transition-all disabled:opacity-50"
          >
            {aiCopy.save}
          </button>
        </form>
      </div>
      </div>

      {/* Superadmin agent: tools, mandatory rules, and chat */}
      <section className="superadmin-panel superadmin-panel-featured rounded-3xl p-5 sm:p-6 space-y-5" aria-labelledby="superadmin-agent-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="superadmin-agent-title" className="text-sm font-bold text-white">{superAdminAgentCopy[lang].title}</h3>
            <p className="mt-1 text-[11px] text-slate-400">{superAdminAgentCopy[lang].description}</p>
          </div>
          <button
            type="button"
            onClick={handleToggleAgent}
            disabled={agentBusy}
            aria-pressed={agentConfig.enabled}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${agentConfig.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'}`}
          >
            {agentConfig.enabled ? superAdminAgentCopy[lang].disable : superAdminAgentCopy[lang].enable}
          </button>
        </div>

        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${agentConfig.enabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
          {agentConfig.enabled ? superAdminAgentCopy[lang].on : superAdminAgentCopy[lang].off}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-white">{superAdminAgentCopy[lang].rules}</h4>
            {!agentRulesEditing && (
              <button
                type="button"
                onClick={handleReloadAgentRules}
                disabled={agentBusy}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {superAdminAgentCopy[lang].reloadRules}
              </button>
            )}
          </div>
          {agentRulesEditing ? (
            <>
              <textarea
                id="superadmin-agent-rules"
                value={agentRulesDraft}
                onChange={(e) => setAgentRulesDraft(e.target.value)}
                maxLength={6000}
                rows={4}
                placeholder={superAdminAgentCopy[lang].rulesHint}
                className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
              />
              <p className="text-[10px] text-slate-500">{superAdminAgentCopy[lang].rulesHint}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveAgentRules}
                  disabled={agentBusy || agentRulesDraft.length > 6000}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {superAdminAgentCopy[lang].saveRules}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAgentRulesDraft(agentConfig.rules || '');
                    setAgentRulesEditing(false);
                  }}
                  disabled={agentBusy}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {superAdminAgentCopy[lang].cancel}
                </button>
                {agentConfig.rules.trim() && (
                  <button
                    type="button"
                    onClick={handleDeleteAgentRules}
                    disabled={agentBusy}
                    className="rounded-xl bg-rose-900/70 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-50"
                  >
                    {superAdminAgentCopy[lang].deleteRules}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="min-h-12 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                {agentConfig.rules.trim()
                  ? <p className="whitespace-pre-wrap break-words">{agentConfig.rules}</p>
                  : <p className="text-slate-500">{superAdminAgentCopy[lang].noRules}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAgentRulesDraft(agentConfig.rules || '');
                    setAgentRulesEditing(true);
                  }}
                  disabled={agentBusy}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {agentConfig.rules.trim() ? superAdminAgentCopy[lang].editRules : superAdminAgentCopy[lang].addRules}
                </button>
                {agentConfig.rules.trim() && (
                  <button
                    type="button"
                    onClick={handleDeleteAgentRules}
                    disabled={agentBusy}
                    className="rounded-xl bg-rose-900/70 px-4 py-2 text-xs font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-50"
                  >
                    {superAdminAgentCopy[lang].deleteRules}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-white">{superAdminAgentCopy[lang].chat}</h4>
              <p className="mt-1 text-[10px] text-slate-400">{superAdminAgentCopy[lang].chatHint}</p>
            </div>
            <button
              type="button"
              onClick={handleClearAgentChat}
              disabled={agentBusy || agentConfig.messages.length === 0}
              className="shrink-0 rounded-lg bg-rose-900/70 px-2.5 py-1.5 text-[10px] font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-50"
            >
              {superAdminAgentCopy[lang].clearChat}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">{superAdminAgentCopy[lang].chatRetention}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3" aria-live="polite">
            {agentConfig.messages.length === 0 && <p className="text-xs text-slate-500">{superAdminAgentCopy[lang].noMessages}</p>}
            {agentConfig.messages.map((message, index) => (
              <div key={`${message.createdAt}-${index}`} className={`max-w-[90%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs ${message.role === 'user' ? 'ml-auto bg-indigo-600/30 text-indigo-100' : 'bg-slate-800 text-slate-200'}`}>
                <AgentMessageContent text={message.content} />
              </div>
            ))}
          </div>
          <form onSubmit={handleAgentChat} className="flex items-end gap-2">
            <textarea
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              maxLength={4000}
              rows={2}
              disabled={!agentConfig.enabled || agentBusy || agentRulesEditing}
              placeholder={superAdminAgentCopy[lang].placeholder}
              className="min-w-0 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!agentConfig.enabled || agentBusy || agentRulesEditing || !agentInput.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {agentBusy ? superAdminAgentCopy[lang].waiting : superAdminAgentCopy[lang].send}
            </button>
          </form>
          {agentActions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-300">{superAdminAgentCopy[lang].actions}</p>
              {agentActions.map((action, index) => (
                <p key={`${action.path}-${index}`} className={`text-[10px] ${action.success ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {action.success ? '✓' : '✕'} {action.method} {action.path} · HTTP {action.status}{action.purpose ? ` · ${action.purpose}` : ''}
                </p>
              ))}
            </div>
          )}
          {agentError && <p role="alert" className="text-xs text-rose-300">{agentError}</p>}
          {agentNotice && <p role="status" className="text-xs text-emerald-300">{agentNotice}</p>}
          <p className="text-[10px] leading-relaxed text-slate-500">{superAdminAgentCopy[lang].privacy}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      {/* 3. Recipient Account (§3.5) */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">Payment Recipient Account</h3>
            <p className="text-[10px] text-slate-400">Receiving company bank account for Top 15</p>
          </div>
        </div>

        <form onSubmit={handleUpdateRecipient} className="space-y-2 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Company IBAN</label>
            <input
              type="text"
              value={recipient.iban || ''}
              onChange={(e) => setRecipient({ ...recipient, iban: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Bank Name</label>
            <input
              type="text"
              value={recipient.bankName || ''}
              onChange={(e) => setRecipient({ ...recipient, bankName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Beneficiary Legal Entity</label>
            <input
              type="text"
              value={recipient.beneficiary || ''}
              onChange={(e) => setRecipient({ ...recipient, beneficiary: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading || configLock.locked}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 rounded-xl text-xs border border-slate-700"
          >
            Update Recipient Details
          </button>
        </form>
      </div>

      {/* 4. Craftsman Listing Subscription Price (§6.6, R-25) */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Craftsman Listing Price (R-25)</h3>
              <p className="text-[10px] text-slate-400">180-day subscription for "Other craftsmen" visibility</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
            {(listingPrice.amountMinor / 100).toFixed(2)} {listingPrice.currency}
          </span>
        </div>

        <form onSubmit={handleUpdateListingPrice} className="space-y-2 text-xs">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400">Price in GEL (0 GEL enables free registration)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newListingPriceGEL}
              onChange={(e) => setNewListingPriceGEL(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading || configLock.locked}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
          >
            Update Listing Subscription Price
          </button>
        </form>
      </div>

      {/* 4. Mandatory Credential Migration */}
      {bootstrapStatus?.bootstrapEnabled && (
        <div className="superadmin-panel superadmin-panel-migration rounded-3xl p-5 sm:p-6 space-y-4 xl:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-xs font-bold text-white">Mandatory Credential Migration</h3>
              <p className="text-[10px] text-purple-300">
                Permanently disable bootstrap credentials and initialize real phone + password.
              </p>
            </div>
          </div>

          <form onSubmit={handleMigrateBootstrap} className="space-y-2 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">New Phone Number (E.164)</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-white font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">New Password (min 12 chars)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Upper + Lower + Digit (12+ chars)"
                className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-white font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">SMS Verification Code</label>
              <input
                type="text"
                value={bootstrapOtp}
                onChange={(e) => setBootstrapOtp(e.target.value)}
                className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-3 py-2 text-white font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || configLock.locked}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-bold py-2.5 rounded-xl text-xs shadow"
            >
              Finalize Migration & Invalidate Bootstrap
            </button>
          </form>
        </div>
      )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
      {/* 5. Payment Providers Configuration (BOG, TBC Bank, Stripe) */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">საგადახდო სისტემები (BOG, TBC, Stripe)</h3>
              <p className="text-[10px] text-slate-400">საქართველოს ბანკი, თიბისი და Stripe-ის მონაცემების შეყვანა</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100">
          {lang === 'ka'
            ? 'ონლაინ გადახდების სერვერული ინტეგრაცია ჯერ დასრულებული არ არის. მონაცემების შენახვა თანხის მიღებას არ ააქტიურებს; წარმოებაში გადახდები უსაფრთხოდ დაბლოკილია.'
            : lang === 'ru'
              ? 'Серверная интеграция онлайн-оплаты ещё не завершена. Сохранение данных не включает приём платежей; в рабочей версии платежи безопасно заблокированы.'
              : 'The server-side online payment integration is not complete. Saving credentials does not enable charges; production payments remain safely disabled.'}
        </div>

        <div className="space-y-2.5 pt-1">
          {paymentProviders.map((prov) => (
            <div
              key={prov.id}
              className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-xs space-y-2 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-white text-xs truncate">
                    {prov.name}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      prov.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {prov.isActive ? 'აქტიური' : 'გამორთული'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleProviderActive(prov)}
                    disabled={loading || configLock.locked || import.meta.env.PROD}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                      prov.isActive
                        ? 'bg-rose-950/40 text-rose-300 border-rose-800 hover:bg-rose-900'
                        : 'bg-emerald-950/40 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                    }`}
                  >
                    {import.meta.env.PROD ? 'ინტეგრაცია მზად არ არის' : prov.isActive ? 'გათიშვა' : 'ჩართვა'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditProvider(prov)}
                    disabled={loading || configLock.locked}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors"
                    title="მონაცემების შეყვანა / რედაქტირება"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-mono space-y-0.5 bg-slate-900/60 p-2 rounded-xl border border-slate-850">
                {prov.clientId && <p>Client ID: <span className="text-slate-200">{prov.clientId}</span></p>}
                {prov.apiKeyMasked && <p>API Key: <span className="text-slate-200">{prov.apiKeyMasked}</span></p>}
                {prov.secretKeyConfigured && <p>Secret Key: <span className="text-slate-200">configured</span></p>}
                {prov.webhookSecretConfigured && <p>Webhook Secret: <span className="text-slate-200">configured</span></p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Commercial Advertisements Management (§Task 10) */}
      <div className="superadmin-panel rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">სარეკლამო ბანერების მართვა</h3>
              <p className="text-[10px] text-slate-400">კომერციული ბანერები, ვადები და მკაცრი პოლიტიკა</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateAdModal(true)}
            disabled={loading}
            className="text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl transition-colors shadow-sm"
          >
            + ახალი პარტნიორი
          </button>
        </div>

        {ads.length === 0 ? (
          <p className="text-xs text-slate-500 py-2 text-center">აქტიური ან რეგისტრირებული ბანერები არ არის</p>
        ) : (
          <div className="space-y-2.5 pt-1">
            {ads.map((adItem) => {
              const isExpired = new Date(adItem.expires_at) < new Date();
              return (
                <div
                  key={adItem.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-xs space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs truncate">
                          {adItem.company_name}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            adItem.is_active && !isExpired && adItem.payment_status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {adItem.is_active && !isExpired && adItem.payment_status === 'paid' ? 'აქტიური' : 'არააქტიური/ვადაგასული'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {adItem.phone_number} • {adItem.payment_status === 'paid' ? 'გადახდილი' : 'გადაუხდელი'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        ვადა: {formatLocalizedDate(lang, adItem.expires_at)} {isExpired && '(ვადა გასულია)'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmAd(adItem)}
                      disabled={loading}
                      className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded-xl border border-rose-800/80 text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                      title="წაშლა და დაბლოკვა"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>წაშლა და დაბლოკვა</span>
                    </button>
                  </div>

                  {adItem.image_url && (
                    <div className="relative aspect-[16/6] w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900 mt-1">
                      <img src={adItem.image_url} alt={adItem.company_name} className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      {/* 7. Signed Backend URL */}
      {backendConfig && (
        <div className="superadmin-panel rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Link className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold text-[11px]">Signed Backend URL</span>
          </div>
          <p className="font-mono text-[10px] text-slate-300 truncate">
            {backendConfig.baseUrl}
          </p>
          <p className="font-mono text-[9px] text-slate-500 truncate">
            Signature: {backendConfig.signature}
          </p>
        </div>
      )}

      {/* 8. SuperAdmin Persistent Storage Status */}
      {persistenceStatus && (
        <div className="superadmin-panel rounded-2xl border-emerald-400/20 p-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>სუპერადმინის კონფიგურაციების მუდმივი შენახვა</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${persistenceStatus.databaseConnected ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}>
              {persistenceStatus.databaseConnected ? t.databaseConnected : t.databaseDisconnected}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            ყველა პარამეტრი (ტარიფები, პროვაიდერები, რეკლამები, რეკვიზიტები, საკეტი) საიმედოდ ინახება და ავტომატურად აღდგება სერვერის ცივი გადატვირთვის / Cold Start-ის შემდეგ.
          </p>
          <div className="flex items-center gap-2 pt-0.5 text-[9px] font-mono text-slate-500">
            <span>სინქრონიზებული: {formatLocalizedTime(lang, persistenceStatus.lastCheck)}</span>
          </div>
        </div>
      )}
      </div>

      {/* Lock Confirmation Modal (Replaces window.confirm) */}
      {showLockConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1">
                Activate 6-Month Lock
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Activate 6-month configuration lock? Human edits to prices, recipients, and roles will be strictly blocked. The app runs autonomously with the selected AI provider.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLockConfirmModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeActivateLock}
                disabled={loading}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {loading ? '...' : 'Confirm & Lock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Provider Edit Modal (BOG, TBC Bank, Stripe) */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-xs font-bold text-white truncate max-w-[200px]">
                    {editingProvider.name}
                  </h3>
                  <span className="text-[10px] text-slate-400">პარამეტრებისა და გასაღებების შეყვანა</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">Client ID / Merchant ID</label>
                <input
                  type="text"
                  value={providerForm.clientId}
                  onChange={(e) => setProviderForm({ ...providerForm, clientId: e.target.value })}
                  placeholder="მაგ: პროვაიდერის მიერ მოწოდებული Merchant ID"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400">Secret Key / Client Secret</label>
                  <button
                    type="button"
                    onClick={() => setShowKeyMask(!showKeyMask)}
                    className="text-[10px] text-amber-400 flex items-center gap-1"
                  >
                    {showKeyMask ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showKeyMask ? 'დამალვა' : 'ჩვენება'}</span>
                  </button>
                </div>
                <input
                  type={showKeyMask ? 'text' : 'password'}
                  value={providerForm.secretKey}
                  onChange={(e) => setProviderForm({ ...providerForm, secretKey: e.target.value })}
                  placeholder={editingProvider.secretKeyConfigured ? 'შეავსეთ მხოლოდ გასაახლებლად' : 'Secret Key...'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              {editingProvider.id === 'prov-stripe' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Publishable Key (pk_test_... / pk_live_...)</label>
                    <input
                      type="text"
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                      placeholder={editingProvider.apiKeyConfigured ? 'შეავსეთ მხოლოდ გასაახლებლად' : 'pk_live_...'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Webhook Secret (whsec_...)</label>
                    <input
                      type="text"
                      value={providerForm.webhookSecret}
                      onChange={(e) => setProviderForm({ ...providerForm, webhookSecret: e.target.value })}
                      placeholder={editingProvider.webhookSecretConfigured ? 'შეავსეთ მხოლოდ გასაახლებლად' : 'whsec_...'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </>
              )}

              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">სისტემაში გააქტიურება</span>
                  <span className="text-[10px] text-slate-400 block">ჩართვის შემთხვევაში გამოჩნდება გადახდისას</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProviderForm({ ...providerForm, isActive: !providerForm.isActive })}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    providerForm.isActive ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      providerForm.isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  გაუქმება
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {loading ? '...' : 'შენახვა'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Ad Partner Modal */}
      {showCreateAdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-amber-400" />
                <h3 className="text-xs font-bold text-white">ახალი სარეკლამო პარტნიორი</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateAdModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAd} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">კომპანიის იურიდიული დასახელება (სურვილისამებრ, პარტნიორსაც შეუძლია შეავსოს)</label>
                <input
                  type="text"
                  value={newAdCompany}
                  onChange={(e) => setNewAdCompany(e.target.value)}
                  placeholder="მაგ: შპს „ელიტ ელექტრონიქსი“"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">ტელეფონის ნომერი (შესასვლელად) *</label>
                <input
                  type="tel"
                  required
                  value={newAdPhone}
                  onChange={(e) => setNewAdPhone(e.target.value)}
                  placeholder="+995599..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">პაროლი *</label>
                <input
                  type="password"
                  required
                  value={newAdPassword}
                  onChange={(e) => setNewAdPassword(e.target.value)}
                  placeholder="მინიმუმ 12 სიმბოლო"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400">ვადა (დღეები)</label>
                  <input
                    type="number"
                    min="1"
                    value={newAdDays}
                    onChange={(e) => setNewAdDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400">თანხა (GEL)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={newAdPrice}
                    onChange={(e) => setNewAdPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAdModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  გაუქმება
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {loading ? '...' : 'პარტნიორის შექმნა'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete & Block Ad Confirmation Modal */}
      {deleteConfirmAd && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1">
                ბანერის წაშლა და დაბლოკვა
              </h3>
              <p className="text-xs text-rose-300 leading-relaxed">
                ნამდვილად გსურთ <strong>{deleteConfirmAd.company_name}</strong>-ის ბანერის მყისიერი წაშლა და პარტნიორის ანგარიშის დაბლოკვა?
              </p>
              <p className="text-[10px] text-slate-400 mt-2">
                ბანერი დაუყოვნებლივ გაქრება მთავარი გვერდიდან.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmAd(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                გაუქმება
              </button>
              <button
                type="button"
                onClick={() => handleBlockAndDeleteAd(deleteConfirmAd.id)}
                disabled={loading}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {loading ? '...' : 'წაშლა და დაბლოკვა'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ));
};


