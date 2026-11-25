import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { clearBogOrder, redirectToBog, savedBogRegistrationProof } from '../bogCheckout.js';
import type { Language } from '../types.js';

export function BogPaymentReturn({ id, lang, onClose, onCabinet }: { id: string; lang: Language; onClose: () => void; onCabinet: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.getBogPaymentStatus>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setError(''); setBusy(true);
    try {
      const payment = await api.getBogPaymentStatus(id, savedBogRegistrationProof());
      setResult(payment);
      if (payment.status !== 'PENDING') clearBogOrder(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check payment status.');
    } finally { setBusy(false); }
  }, [id]);
  useEffect(() => { void check(); }, [check]);

  const copy = (ka: string, ru: string, en: string) => lang === 'ka' ? ka : lang === 'ru' ? ru : en;
  const status = result?.status;
  const message = status === 'SUCCEEDED'
    ? copy('ბანკმა გადახდა დაადასტურა. მომსახურება გააქტიურდა.', 'Банк подтвердил оплату. Услуга активирована.', 'The bank confirmed payment. The service is active.')
    : status === 'FAILED'
      ? copy('შეკვეთა წარმატებული გადახდით არ დასრულებულა.', 'Заказ не завершён успешной оплатой.', 'The order did not complete with a successful payment.')
      : status === 'REVIEW'
        ? copy('ბანკმა გადახდა დაადასტურა, მომსახურებას კი შემოწმება სჭირდება. დაუკავშირდით Master Boy-ს და მიუთითეთ შეკვეთის ნომერი.', 'Банк подтвердил оплату, но услугу нужно проверить. Сообщите Master Boy номер заказа.', 'The bank confirmed payment, but the service requires review. Contact Master Boy with the order number.')
        : copy('ველოდებით ბანკის დადასტურებას.', 'Ожидаем подтверждения банка.', 'Waiting for the bank to confirm payment.');
  return <div role="dialog" aria-modal="true" aria-labelledby="bog-payment-result" className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/90 p-4">
    <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-100">
      <h2 id="bog-payment-result" className="mb-3 text-lg font-bold">{copy('BOG გადახდა', 'Оплата BOG', 'BOG payment')}</h2>
      <p role={error ? 'alert' : 'status'}>{busy ? copy('ვამოწმებთ გადახდას…', 'Проверяем оплату…', 'Checking payment…') : error || message}</p>
      <p className="mt-2 break-all text-xs text-slate-400">{copy('შეკვეთა', 'Заказ', 'Order')} {id}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-slate-800 px-3 py-2" onClick={onClose}>{copy('დახურვა', 'Закрыть', 'Close')}</button>
        {!busy && (!status || status === 'PENDING') && <button type="button" className="rounded-lg bg-slate-800 px-3 py-2" onClick={check}>{copy('ხელახლა შემოწმება', 'Проверить снова', 'Check again')}</button>}
        {!busy && status === 'PENDING' && result?.redirectUrl && <button type="button" className="rounded-lg bg-slate-800 px-3 py-2" onClick={() => redirectToBog(result)}>{copy('ბანკის გვერდის გახსნა', 'Открыть страницу банка', 'Open bank page')}</button>}
        {!busy && (status === 'SUCCEEDED' || error) && <button type="button" className="rounded-lg bg-amber-400 px-3 py-2 font-bold text-slate-950" onClick={onCabinet}>{copy('კაბინეტში შესვლა', 'Войти в кабинет', 'Open account')}</button>}
      </div>
    </section>
  </div>;
}
