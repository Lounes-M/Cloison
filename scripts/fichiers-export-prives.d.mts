export function systemeSupporte(): boolean
export function verifierSysteme(): void
export function parentsDirects(chemin: string): Promise<void>
export function repertoirePrive(chemin: string): Promise<void>
export function lireBorne(chemin: string, maximum: number): Promise<Buffer>
export function ecrireNeuf(chemin: string, octets: Buffer): Promise<void>
