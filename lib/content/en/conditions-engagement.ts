import type { Textes } from '@/lib/i18n'
import type { conditionsEngagement as Fr } from '../conditions-engagement'

export const conditionsEngagement: Textes<typeof Fr> = {
  perimees:
    'The terms have changed since this form was opened. Reload the page and check your commitment before you continue.',
  modification:
    'Changing the maximum amount, the cover, the end date or the joint liability erases the previous handwritten statement. You will need to enter it again for the new terms.',
}
