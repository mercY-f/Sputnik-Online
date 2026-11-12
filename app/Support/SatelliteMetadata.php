<?php

namespace App\Support;

class SatelliteMetadata
{
    /**
     * SATCAT Owner code -> Russian human-readable country/owner name
     */
    public const COUNTRY_NAMES = [
        'US' => 'США',
        'CIS' => 'Россия / СНГ',
        'PRC' => 'Китай',
        'UK' => 'Великобритания',
        'JPN' => 'Япония',
        'IND' => 'Индия',
        'GER' => 'Германия',
        'FR' => 'Франция',
        'IT' => 'Италия',
        'CA' => 'Канада',
        'ESA' => 'ЕКА (Европейское космическое агентство)',
        'SKOR' => 'Южная Корея',
        'NKOR' => 'КНДР',
        'SPN' => 'Испания',
        'TURK' => 'Турция',
        'SES' => 'Люксембург (SES)',
        'ITSO' => 'Международная (ITSO)',
        'O3B' => 'Международная (O3b)',
        'AUS' => 'Австралия',
        'ARGN' => 'Аргентина',
        'ROC' => 'Тайвань',
        'FIN' => 'Финляндия',
        'EUTE' => 'Франция (Eutelsat)',
        'GLOB' => 'США (Globalstar)',
        'GREC' => 'Греция',
        'UAE' => 'ОАЭ',
        'SING' => 'Сингапур',
        'NOR' => 'Норвегия',
        'ISRA' => 'Израиль',
        'SAUD' => 'Саудовская Аравия',
        'POL' => 'Польша',
        'ORB' => 'США (Orbcomm)',
        'IM' => 'Великобритания (Inmarsat)',
        'BRAZ' => 'Бразилия',
        'POR' => 'Португалия',
        'BELA' => 'Беларусь',
        'KAZ' => 'Казахстан',
        'UKR' => 'Украина',
        'AZER' => 'Азербайджан',
        'SWED' => 'Швеция',
        'SWTZ' => 'Швейцария',
        'NETH' => 'Нидерланды',
        'BEL' => 'Бельгия',
        'DEN' => 'Дания',
        'IRAN' => 'Иран',
        'EGYP' => 'Египет',
        'INDO' => 'Индонезия',
        'THAI' => 'Таиланд',
        'MEX' => 'Мексика',
        'ROM' => 'Румыния',
        'HUN' => 'Венгрия',
        'CZCH' => 'Чехия',
        'SVK' => 'Словакия',
        'SVN' => 'Словения',
        'LUXE' => 'Люксембург',
        'IRAQ' => 'Ирак',
        'BGD' => 'Бангладеш',
        'PAKI' => 'Пакистан',
        'CHLE' => 'Чили',
        'PERU' => 'Перу',
        'BOL' => 'Боливия',
        'ECU' => 'Эквадор',
        'VENZ' => 'Венесуэла',
        'SAFR' => 'ЮАР',
        'ALG' => 'Алжир',
        'ANG' => 'Ангола',
        'ETH' => 'Эфиопия',
        'RWA' => 'Руанда',
        'BWA' => 'Ботсвана',
        'NIG' => 'Нигерия',
        'MA' => 'Марокко',
        'BHR' => 'Бахрейн',
        'KWT' => 'Кувейт',
        'JOR' => 'Иордания',
        'MALA' => 'Малайзия',
        'VTNM' => 'Вьетнам',
        'LAOS' => 'Лаос',
        'RP' => 'Филиппины',
        'NZ' => 'Новая Зеландия',
        'MNE' => 'Черногория',
        'HRV' => 'Хорватия',
        'BUL' => 'Болгария',
        'LTU' => 'Литва',
        'DJI' => 'Джибути',
        'ISS' => 'Международная',
        'EUME' => 'Европейская (EUMETSAT)',
        'TBD' => 'Не определено',
    ];

    /**
     * SATCAT Owner code -> ISO 3166-1 alpha-2 code (or custom for international)
     */
    public const ISO_CODES = [
        'US' => 'US',
        'CIS' => 'RU',
        'PRC' => 'CN',
        'UK' => 'GB',
        'JPN' => 'JP',
        'IND' => 'IN',
        'GER' => 'DE',
        'FR' => 'FR',
        'IT' => 'IT',
        'CA' => 'CA',
        'ESA' => 'EU',
        'SKOR' => 'KR',
        'NKOR' => 'KP',
        'SPN' => 'ES',
        'TURK' => 'TR',
        'SES' => 'LU',
        'ITSO' => 'UN',
        'O3B' => 'LU',
        'AUS' => 'AU',
        'ARGN' => 'AR',
        'ROC' => 'TW',
        'FIN' => 'FI',
        'EUTE' => 'FR',
        'GLOB' => 'US',
        'GREC' => 'GR',
        'UAE' => 'AE',
        'SING' => 'SG',
        'NOR' => 'NO',
        'ISRA' => 'IL',
        'SAUD' => 'SA',
        'POL' => 'PL',
        'ORB' => 'US',
        'IM' => 'GB',
        'BRAZ' => 'BR',
        'POR' => 'PT',
        'BELA' => 'BY',
        'KAZ' => 'KZ',
        'UKR' => 'UA',
        'AZER' => 'AZ',
        'SWED' => 'SE',
        'SWTZ' => 'CH',
        'NETH' => 'NL',
        'BEL' => 'BE',
        'DEN' => 'DK',
        'IRAN' => 'IR',
        'EGYP' => 'EG',
        'INDO' => 'ID',
        'THAI' => 'TH',
        'MEX' => 'MX',
        'ROM' => 'RO',
        'HUN' => 'HU',
        'CZCH' => 'CZ',
        'SVK' => 'SK',
        'SVN' => 'SI',
        'LUXE' => 'LU',
        'IRAQ' => 'IQ',
        'BGD' => 'BD',
        'PAKI' => 'PK',
        'CHLE' => 'CL',
        'PERU' => 'PE',
        'BOL' => 'BO',
        'ECU' => 'EC',
        'VENZ' => 'VE',
        'SAFR' => 'ZA',
        'ALG' => 'DZ',
        'ANG' => 'AO',
        'ETH' => 'ET',
        'RWA' => 'RW',
        'BWA' => 'BW',
        'NIG' => 'NG',
        'MA' => 'MA',
        'BHR' => 'BH',
        'KWT' => 'KW',
        'JOR' => 'JO',
        'MALA' => 'MY',
        'VTNM' => 'VN',
        'LAOS' => 'LA',
        'RP' => 'PH',
        'NZ' => 'NZ',
        'MNE' => 'ME',
        'HRV' => 'HR',
        'BUL' => 'BG',
        'LTU' => 'LT',
        'DJI' => 'DJ',
        'ISS' => 'UN',
        'EUME' => 'EU',
    ];

    /**
     * SATCAT launch site code -> readable launch site name
     */
    public const LAUNCH_SITES = [
        'AFETR' => 'Мыс Канаверал (AFETR)',
        'AFWTR' => 'Ванденберг (AFWTR)',
        'TYMSC' => 'Байконур (TYMSC)',
        'VOSTO' => 'Восточный (VOSTO)',
        'PLMSC' => 'Плесецк (PLMSC)',
        'FRGUI' => 'Куру (FRGUI)',
        'JSC' => 'Цзюцюань (JSC)',
        'XICLF' => 'Сичан (XICLF)',
        'TAISC' => 'Тайюань (TAISC)',
        'WSC' => 'Вэньчан (WSC)',
        'SRILR' => 'Шрихарикота (SRILR)',
        'TANSC' => 'Танегасима (TANSC)',
        'RLLB' => 'Махия (RLLB)',
        'STARB' => 'Starbase, Бока-Чика (STARB)',
        'WLPIS' => 'Уоллопс (WLPIS)',
        'NSC' => 'Наро (NSC)',
        'DLS' => 'Ясный / Домбаровский (DLS)',
        'YSLA' => 'Жёлтое море (YSLA)',
        'SEAL' => 'Морской старт (Sea Launch)',
        'KSCUT' => 'Утиноура (KSCUT)',
        'ERAS' => 'Аль-Анбар (ERAS)',
        'SVIET' => 'Свободный (SVIET)',
        'KYMTR' => 'Капустин Яр (KYMTR)',
        'SEM' => 'Семнан (SEM)',
        'SOYUZ' => 'Куру (Союз)',
    ];

    /**
     * Get human-readable Russian country/owner name from SATCAT owner code.
     */
    public static function getCountryName(?string $ownerCode): ?string
    {
        if ($ownerCode === null || trim($ownerCode) === '') {
            return null;
        }

        $upper = strtoupper(trim($ownerCode));
        return self::COUNTRY_NAMES[$upper] ?? $upper;
    }

    /**
     * Get ISO 2-letter country code for flag emoji display.
     */
    public static function getIsoCode(?string $ownerCode): ?string
    {
        if ($ownerCode === null || trim($ownerCode) === '') {
            return null;
        }

        $upper = strtoupper(trim($ownerCode));
        return self::ISO_CODES[$upper] ?? (strlen($upper) === 2 ? $upper : null);
    }

    /**
     * Get human-readable Russian launch site name.
     */
    public static function getLaunchSiteName(?string $siteCode): ?string
    {
        if ($siteCode === null || trim($siteCode) === '') {
            return null;
        }

        $upper = strtoupper(trim($siteCode));
        return self::LAUNCH_SITES[$upper] ?? $upper;
    }

    /**
     * Derive satellite purpose in Russian using heuristics based on name prefix, category, and object type.
     */
    public static function getPurpose(?string $name, ?string $category = null, ?string $objectType = null): string
    {
        $objUpper = strtoupper(trim((string)$objectType));
        if ($objUpper === 'R/B') {
            return 'Отработавшая ступень ракеты';
        }
        if ($objUpper === 'DEB') {
            return 'Космический мусор';
        }

        $nameUpper = strtoupper(trim((string)$name));
        $catUpper = strtoupper(trim((string)$category));

        // Name checks
        if ($nameUpper !== '') {
            if (str_contains($nameUpper, 'DEB') || str_contains($nameUpper, 'R/B') || str_contains($nameUpper, 'DEBRIS')) {
                return 'Космический мусор';
            }
            if (str_starts_with($nameUpper, 'STARLINK')) {
                return 'Широкополосный интернет';
            }
            if (str_starts_with($nameUpper, 'ONEWEB')) {
                return 'Широкополосный интернет';
            }
            if (self::matchesAny($nameUpper, ['GPS', 'NAVSTAR', 'GLONASS', 'ГЛОНАСС', 'GALILEO', 'BEIDOU', 'BDS', 'QZSS', 'IRNSS', 'NAVIC'])) {
                return 'Спутниковая навигация';
            }
            if (self::matchesAny($nameUpper, ['NOAA', 'METEOR', 'МЕТЕОР', 'GOES', 'FENGYUN', 'FY-', 'ELEKTRO', 'ELECTRO', 'HIMAWARI', 'METEOSAT', 'INSAT'])) {
                return 'Метеорология';
            }
            if (self::matchesAny($nameUpper, ['ISS', 'ZARYA', 'ZVEZDA', 'TIANGONG', 'TIANHE', 'WENTIAN', 'MENGTIAN', 'CSS'])) {
                return 'Пилотируемая орбитальная станция';
            }
            if (self::matchesAny($nameUpper, ['HUBBLE', 'HST', 'JWST', 'WEBB', 'SPITZER', 'CHANDRA', 'KEPLER', 'TESS', 'SPEKTR', 'SPECTR', 'EUCLID', 'GAIA', 'INTEGRAL', 'XMM', 'NUSTAR', 'CHEOPS', 'SWIFT'])) {
                return 'Космическая обсерватория';
            }
            if (self::matchesAny($nameUpper, ['IRIDIUM', 'GLOBALSTAR', 'ORBCOMM', 'INMARSAT', 'INTELSAT', 'EUTELSAT', 'SES', 'EXPRESS', 'EKSPRESS', 'YAMAL', 'GONETS', 'ГОНЕЦ', 'THURAYA', 'VIASAT', 'ECHOSTAR', 'AMOS'])) {
                return 'Спутниковая связь';
            }
            if (self::matchesAny($nameUpper, ['COSMOS', 'КОСМОС', 'USA', 'NROL', 'KH-', 'LACROSSE'])) {
                return 'Военные/специальные';
            }
            if (self::matchesAny($nameUpper, ['RESURS', 'RESOURCE', 'KANOPUS', 'КАНОПУС', 'SENTINEL', 'LANDSAT', 'SPOT', 'CARTOSAT', 'PLEIADES', 'PLANETSCOPE', 'FLOCK', 'SKYSAT', 'GAOFEN', 'YAOGAN'])) {
                return 'Дистанционное зондирование Земли';
            }
        }

        // Fallback by category
        return match ($catUpper) {
            'STARLINK', 'ONEWEB' => 'Широкополосный интернет',
            'NAVIGATION' => 'Спутниковая навигация',
            'WEATHER' => 'Метеорология',
            'TELESCOPE' => 'Космическая обсерватория',
            'ISS' => 'Пилотируемая орбитальная станция',
            'IRIDIUM' => 'Спутниковая связь',
            default => 'Не определено',
        };
    }

    private static function matchesAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }
        return false;
    }
}
