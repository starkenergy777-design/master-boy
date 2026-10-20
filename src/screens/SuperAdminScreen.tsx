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

interface SuperAdminScreenProps {
  lang: Language;
  currentUser: User;
  onBack: () => void;
}

export const SuperAdminScreen: React.FC<SuperAdminScreenProps> = ({
  lang,
  currentUser,
  onBack,
}) => {
  const t = translations[lang] || translations.ka;

  // Gemini State (§3.8)
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiOtpCode, setGeminiOtpCode] = useState('');
  const [geminiStatus, setGeminiStatus] = useState<any>(null);

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
    isActive: true,
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

  const loadAll = async () => {
    try {
      setLoading(true);
      const [aiStat, recStat, lockStat, bootStat, backStat, listPriceStat, provStat, adsStat, persistStat] = await Promise.all([
        api.getGeminiStatus(),
        api.getRecipientAccount(),
        api.getConfigLock(),
        api.getBootstrapStatus(),
        api.getBackendConfig(),
        api.getListingPrice().catch(() => null),
        api.getProviders('payment').catch(() => []),
        api.getAdminAds().catch(() => []),
        api.getPersistenceStatus().catch(() => null),
      ]);
      setGeminiStatus(aiStat);
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

  // Update Gemini Key with OTP Re-confirmation (§3.8)
  const handleUpdateGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKeyInput.trim()) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setLoading(true);
      const res = await api.updateGeminiKey(geminiKeyInput, geminiOtpCode);
      setGeminiStatus(res);
      setGeminiKeyInput(''); // Never stored in state after submit!
      setSuccessMsg('Gemini API key verified and stored securely in backend.');
    } catch (err: any) {
      if (err.status === 423) {
        setErrorMsg('423 CONFIG_LOCKED: Cannot modify AI key during 6-month lock.');
      } else {
        setErrorMsg(err.message || 'Key verification failed');
      }
    } finally {
      setLoading(false);
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
      setSuccessMsg('Configuration locked for 6 months. App runs autonomously with Gemini.');
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
      if (isNaN(val) || val <= 0) {
        setErrorMsg('Enter valid positive price');
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
        setErrorMsg(err.message || 'სტატუსის შეცვლა ვერ მოხ�