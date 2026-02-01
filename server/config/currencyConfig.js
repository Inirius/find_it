// Currency configurations for price extraction

export function getCurrency(country) {
  const currencies = {
    // EUR countries
    at: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    be: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    cz: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    de: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    ee: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    es: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    fi: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    fr: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    gr: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    ie: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    it: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    lt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    lv: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    nl: { symbol: '€', pattern: '(€\\s*\\d+,\\d{2})' },  // Format NL: € 250,00
    pt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    sk: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    si: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    cy: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    mt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },  // Malta Euro
    // Non-EUR countries
    al: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Albanian Lek
    am: { symbol: '֏', pattern: '(\\d+\\s*֏)' },  // Armenian Dram
    au: { symbol: 'A\\$', pattern: '(A\\$\\s*\\d+)' },  // Australian Dollar
    ba: { symbol: 'KM', pattern: '(\\d+\\s*KM)' },  // Convertible Mark
    bg: { symbol: 'лв', pattern: '(\\d+\\s*лв)' },  // Bulgarian Lev
    by: { symbol: 'Br', pattern: '(\\d+\\s*Br)' },  // Belarusian Ruble
    dk: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Danish Krone
    gb: { symbol: '£', pattern: '(£\\s*\\d+)' },  // British Pound
    ge: { symbol: '₾', pattern: '(\\d+\\s*₾)' },  // Georgian Lari
    hr: { symbol: 'kn', pattern: '(\\d+\\s*kn)' },  // Croatian Kuna
    hu: { symbol: 'Ft', pattern: '(\\d+\\s*Ft)' },  // Hungarian Forint
    is: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Icelandic Króna
    kz: { symbol: '₸', pattern: '(\\d+\\s*₸)' },  // Kazakhstani Tenge
    md: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Moldovan Leu
    mk: { symbol: 'ден', pattern: '(\\d+\\s*ден)' },  // Macedonian Denar
    no: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Norwegian Krone
    pl: { symbol: 'zł', pattern: '(\\d+(?:\\s|,)\\d{2}\\s*zł)' },  // Polish Zloty
    ro: { symbol: 'lei', pattern: '(\\d+\\s*lei)' },  // Romanian Leu
    ru: { symbol: '₽', pattern: '(\\d+\\s*₽)' },  // Russian Ruble
    rs: { symbol: 'дин', pattern: '(\\d+\\s*дин)' },  // Serbian Dinar
    se: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Swedish Krona
    tr: { symbol: '₺', pattern: '(\\d+\\s*₺)' },  // Turkish Lira
    ua: { symbol: '₴', pattern: '(\\d+\\s*₴)' },  // Ukrainian Hryvnia
    xk: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Kosovo Lek
  };
  return currencies[country] || currencies.fr;
}
