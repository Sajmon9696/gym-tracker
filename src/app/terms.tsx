import { PublicInformationPage } from '@/components/public-information-page';
import { termsSections } from '@/content/public-information';

export default function TermsScreen() {
  return <PublicInformationPage title="Regulamin" intro="Zasady korzystania z Progres i współpracy z trenerem." sections={termsSections} />;
}

