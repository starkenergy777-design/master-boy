import type { Request, Response } from 'express';
import { db } from './db.js';
import type { Language } from './types.js';
import type { PlatformInformation } from '../src/platformInformation.js';

export function getPlatformInformation(lang: Language = 'ka'): PlatformInformation {
  const d = db.merchantDisclosure;
  // Explicit public projection: never include configuration credentials or internal audit fields.
  return {
    merchant: { legalName: d.legalName, identificationCode: d.identificationCode, address: d.address, phone: d.phone, email: d.email },
    listing: { amountMinor: db.listingPrice.amountMinor, currency: db.listingPrice.currency },
    top15: [...db.top15Prices.values()].flatMap(price => {
      const city = db.cities.find(c => c.id === price.cityId && c.isActive);
      const profession = db.professions.find(p => p.id === price.professionId);
      return city && profession ? [{ city: city.name[lang], profession: profession.name[lang], amountMinor: price.amountMinor, currency: price.currency }] : [];
    }),
  };
}

export function platformInformationHandler(req: Request, res: Response) {
  const language = req.header('Accept-Language')?.toLowerCase() || 'ka';
  const lang = language.startsWith('ru') ? 'ru' : language.startsWith('en') ? 'en' : 'ka';
  res.set('Cache-Control', 'no-store').json(getPlatformInformation(lang));
}
