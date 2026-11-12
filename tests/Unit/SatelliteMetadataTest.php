<?php

namespace Tests\Unit;

use App\Support\SatelliteMetadata;
use PHPUnit\Framework\TestCase;

class SatelliteMetadataTest extends TestCase
{
    public function test_country_name_mapping(): void
    {
        $this->assertSame('США', SatelliteMetadata::getCountryName('US'));
        $this->assertSame('Россия / СНГ', SatelliteMetadata::getCountryName('CIS'));
        $this->assertSame('Китай', SatelliteMetadata::getCountryName('PRC'));
        $this->assertSame('Великобритания', SatelliteMetadata::getCountryName('UK'));
        $this->assertSame('ЕКА (Европейское космическое агентство)', SatelliteMetadata::getCountryName('ESA'));
        $this->assertNull(SatelliteMetadata::getCountryName(null));
        $this->assertNull(SatelliteMetadata::getCountryName(''));
        $this->assertSame('UNKNOWN_XYZ', SatelliteMetadata::getCountryName('UNKNOWN_XYZ'));
    }

    public function test_iso_code_mapping(): void
    {
        $this->assertSame('US', SatelliteMetadata::getIsoCode('US'));
        $this->assertSame('RU', SatelliteMetadata::getIsoCode('CIS'));
        $this->assertSame('CN', SatelliteMetadata::getIsoCode('PRC'));
        $this->assertSame('GB', SatelliteMetadata::getIsoCode('UK'));
        $this->assertSame('EU', SatelliteMetadata::getIsoCode('ESA'));
        $this->assertNull(SatelliteMetadata::getIsoCode(null));
    }

    public function test_launch_site_mapping(): void
    {
        $this->assertSame('Мыс Канаверал (AFETR)', SatelliteMetadata::getLaunchSiteName('AFETR'));
        $this->assertSame('Байконур (TYMSC)', SatelliteMetadata::getLaunchSiteName('TYMSC'));
        $this->assertSame('Куру (FRGUI)', SatelliteMetadata::getLaunchSiteName('FRGUI'));
        $this->assertNull(SatelliteMetadata::getLaunchSiteName(null));
    }

    public function test_purpose_heuristics(): void
    {
        $this->assertSame('Широкополосный интернет', SatelliteMetadata::getPurpose('STARLINK-1454', 'STARLINK'));
        $this->assertSame('Широкополосный интернет', SatelliteMetadata::getPurpose('ONEWEB-0120', 'ONEWEB'));
        $this->assertSame('Спутниковая навигация', SatelliteMetadata::getPurpose('NAVSTAR 65 (USA 213)', 'OTHER'));
        $this->assertSame('Спутниковая навигация', SatelliteMetadata::getPurpose('COSMOS 2465 (GLONASS 737)', 'OTHER'));
        $this->assertSame('Метеорология', SatelliteMetadata::getPurpose('NOAA 19', 'WEATHER'));
        $this->assertSame('Пилотируемая орбитальная станция', SatelliteMetadata::getPurpose('ISS (ZARYA)', 'ISS'));
        $this->assertSame('Космическая обсерватория', SatelliteMetadata::getPurpose('HST', 'TELESCOPE'));
        $this->assertSame('Спутниковая связь', SatelliteMetadata::getPurpose('IRIDIUM 100', 'IRIDIUM'));
        $this->assertSame('Военные/специальные', SatelliteMetadata::getPurpose('USA 245 (NROL-65)', 'OTHER'));
        $this->assertSame('Отработавшая ступень ракеты', SatelliteMetadata::getPurpose('FALCON 9 R/B', 'OTHER', 'R/B'));
        $this->assertSame('Космический мусор', SatelliteMetadata::getPurpose('FENGYUN 1C DEB', 'OTHER', 'DEB'));
        $this->assertSame('Метеорология', SatelliteMetadata::getPurpose('UNKNOWN METEO', 'WEATHER'));
        $this->assertSame('Не определено', SatelliteMetadata::getPurpose('SOMETHING UNKNOWN', 'OTHER'));
    }
}
