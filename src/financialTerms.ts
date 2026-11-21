import type { Language } from './types.js';

// Keep this identifier stable: a later revision must use a new version rather
// than silently changing the conditions attached to an earlier purchase.
export { FINANCIAL_TERMS_VERSION } from '../server/financial.js';

export const financialTerms = {
  ka: {
    title: 'ხელოსნის გადახდისა და დაბრუნების წესები',
    introduction: 'ეს წესები ეხება მხოლოდ Master Boy-ისთვის გადახდილ ხელოსნის 180-დღიანი განთავსებისა და Top 15-ის 30-დღიანი ადგილის საფასურს. ხელოსანსა და მის კლიენტს შორის სამუშაოს ღირებულებაზე შეთანხმება და ანგარიშსწორება ამ წესებში არ შედის.',
    sections: [
      ['რას ყიდულობთ', '180-დღიანი განთავსება გაძლევთ აქტიური პროფილის ხილვადობას თქვენს ქალაქსა და პროფესიაში. Top 15 გაძლევთ ერთ ადგილს იმავე ქალაქისა და პროფესიის პრიორიტეტულ სიაში 30 დღით. ზარები, სამუშაო შეკვეთები და შემოსავალი გარანტირებული არ არის. საბოლოო ფასი ნაჩვენებია გადახდამდე. 0-ლარიანი განთავსება საბანკო გადახდას არ იწვევს.'],
      ['როდის იწყება ვადა', '180 დღე იწყება პროფილის აქტივაციის დადასტურებისას. Top 15-ის 30 დღე იწყება მხოლოდ წარმატებული გადახდისა და ადგილის რეალური მინიჭების შემდეგ. ავტომატური განახლება არ ხდება.'],
      ['ბოლო თავისუფალი ადგილი', 'გადახდის მოთხოვნების რიგი 10 წამს გრძელდება მაშინაც, თუ მხოლოდ ერთი ხელოსანი მონაწილეობს. რიგში წაგებულისთვის საბანკო გადახდა არ იწყება. თუ ადგილი სავსეა, გადახდის ღილაკი მიუწვდომელია.'],
      ['თანხის დაბრუნება', 'თუ თანხა ჩამოიჭრა, მაგრამ შეძენილი მომსახურება არ გააქტიურდა, ან თანხა ორჯერ/ზედმეტად ჩამოიჭრა, შესაბამისი თანხა სრულად ბრუნდება. თუ მომსახურება ვადამდე შეწყდა, გამოუყენებელი დროის საფასური ბრუნდება: რეალურად გადახდილი თანხა × გამოუყენებელი დრო ÷ სრული შეძენილი დრო, თეთრებამდე დამრგვალებით. უკვე მიწოდებული დროის საფასური Master Boy-ს რჩება. ვადის გაგრძელება თანხის დაბრუნების ნაცვლად მხოლოდ თქვენი თანხმობით მოხდება.'],
      ['საჩივარი და გადაწყვეტილება', 'კონკრეტული გადახდის პრობლემა შეგიძლიათ მოგვწეროთ კაბინეტიდან ან ელფოსტაზე starkenergy777@gmail.com. მიუთითეთ შეკვეთის ნომერი და პრობლემა; სრული საბარათე ნომერი ან CVV არ გამოგვიგზავნოთ. მიღებას ვადასტურებთ 1 სამუშაო დღეში, ჩვეულებრივ საქმეზე დასაბუთებულ პასუხს ვგეგმავთ 5 სამუშაო დღეში. რთულ საქმეზე შეგატყობინებთ დაგვიანების მიზეზსა და ახალ ვადას. უარის ხელახლა განხილვა შეგიძლიათ მოითხოვოთ. ბანკისთვის მიმართვის უფლებას ეს პროცესი არ ზღუდავს.'],
      ['ანგარიშის შეზღუდვა', 'სავარაუდო დარღვევისას გაცნობებთ მიზეზს და მოგცემთ პასუხის შესაძლებლობას, თუ დაუყოვნებელი შეზღუდვა უსაფრთხოების ან კანონის გამო აუცილებელი არ არის. გამოუყენებელი დროის საფასური გადაწყდება დადასტურებული ფაქტებისა და მოქმედი კანონის საფუძველზე; მხოლოდ საჩივრის შეტანა სანქციის მიზეზი არ არის.'],
    ],
  },
  ru: {
    title: 'Правила оплаты и возврата для мастеров',
    introduction: 'Эти правила относятся только к оплате 180-дневного размещения мастера и 30-дневного места Top 15 в Master Boy. Оплата работ между мастером и его клиентом сюда не входит.',
    sections: [
      ['Что вы покупаете', 'Размещение дает видимость активного профиля в вашем городе и профессии на 180 дней. Top 15 дает одно место в приоритетном списке той же категории на 30 дней. Звонки, заказы и доход не гарантируются. Итоговая цена показана до оплаты. При цене 0 GEL банковская оплата не производится.'],
      ['Начало срока', '180 дней начинаются после подтверждения активации профиля. 30 дней Top 15 начинаются только после успешной оплаты и фактического предоставления места. Автоматического продления нет.'],
      ['Последнее место', 'Очередь заявок длится 10 секунд даже при одном участнике. Для проигравших банковская оплата не начинается. Когда все места заняты, кнопка оплаты недоступна.'],
      ['Возврат', 'Если деньги списаны, но услуга не активирована, или списана лишняя сумма, соответствующая сумма возвращается полностью. При досрочном прекращении возвращается неиспользованная часть: фактически уплаченная сумма × неиспользованное время ÷ полный срок, с округлением до тетри. Оплаченный период фактически оказанной услуги остается Master Boy. Продление срока вместо возврата возможно только с вашего согласия.'],
      ['Жалобы', 'Сообщите о конкретном платеже в кабинете или по адресу starkenergy777@gmail.com. Укажите номер заказа и проблему; не отправляйте полный номер карты или CVV. Мы подтверждаем получение в течение 1 рабочего дня и стремимся дать мотивированный ответ по обычному делу в течение 5 рабочих дней. О задержке и новом сроке сообщим отдельно. Можно потребовать пересмотр отказа. Обращение в банк не ограничивается.'],
      ['Ограничение аккаунта', 'При предполагаемом нарушении мы сообщаем причину и даем возможность ответить, кроме случаев, когда немедленное ограничение требуется для безопасности или по закону. Неиспользованная часть рассматривается по подтвержденным фактам и применимому праву. Жалоба сама по себе не является причиной санкции.'],
    ],
  },
  en: {
    title: 'Craftsman payment and refund terms',
    introduction: 'These terms cover only payments to Master Boy for a 180-day craftsman listing or a 30-day Top 15 slot. Payment for work agreed directly between a craftsman and a customer is outside these terms.',
    sections: [
      ['What you buy', 'A listing makes your active profile visible in your city and profession for 180 days. Top 15 provides one priority-list slot in that same category for 30 days. Calls, jobs and income are not guaranteed. The final price appears before payment. A 0 GEL listing does not trigger a bank payment.'],
      ['When the term starts', 'The 180 days begin when the profile is confirmed active. The Top 15 period begins only after successful payment and actual slot activation. There is no automatic renewal.'],
      ['Last available slot', 'The payment-request queue runs for 10 seconds even with one participant. No bank payment starts for unsuccessful participants. The payment button is unavailable when all slots are occupied.'],
      ['Refunds', 'If money is taken but the purchased service never activates, or an excess amount is taken, the applicable amount is refunded in full. If service ends early, the unused portion is refunded: amount actually paid × unused time ÷ total purchased time, rounded to the nearest tetri. Master Boy retains the value of service already delivered. An extension instead of a refund requires your agreement.'],
      ['Complaints', 'Report a specific payment from your account or at starkenergy777@gmail.com. Include the order number and problem; never send your full card number or CVV. We acknowledge receipt within 1 business day and aim to give a reasoned answer to an ordinary case within 5 business days. We will explain delays and give a revised date. You may request review of a refusal. Your right to contact your bank remains unaffected.'],
      ['Account restrictions', 'If a breach is suspected, we explain the reason and allow you to respond unless immediate action is necessary for safety or law. Any unused portion is decided on verified facts and applicable law. Filing a complaint alone is never grounds for a sanction.'],
    ],
  },
} as const;

export function termsFor(language: Language) {
  return financialTerms[language] || financialTerms.ka;
}
