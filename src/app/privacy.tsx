import { PublicInformationPage } from '@/components/public-information-page';
import { privacySections } from '@/content/public-information';

export default function PrivacyScreen() {
  return <PublicInformationPage title="Polityka prywatności" intro="Jak Progres korzysta z danych konta, treningów i integracji z Google." sections={privacySections} />;
}

