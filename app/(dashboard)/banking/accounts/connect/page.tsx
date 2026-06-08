import { requireOrganization } from "@/lib/auth-helpers";
import { BankingConnectPicker } from "@/components/banking/connect-picker";

export const metadata = {
  title: "Connect Bank or Credit Card",
};

/**
 * /banking/accounts/connect — the "Connect Bank / Credit Card" picker
 * targeted by the empty-state primary CTA and the "Add Bank Account"
 * header button on the populated /banking page.
 *
 * Until BNK-J (third-party feed aggregator) and BNK-K (partner-bank
 * direct integrations) ship, this page is a Zoho-shaped teaser:
 * the partner / supported banks lists render but every entry opens
 * a "coming soon" dialog with an "Add Manually" CTA. The "Add bank
 * or credit card account manually" section is fully functional.
 */
export default async function ConnectBankAccountPage() {
  await requireOrganization();
  return <BankingConnectPicker />;
}
