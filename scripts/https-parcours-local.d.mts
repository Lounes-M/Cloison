export function ouvrirRelaisLocal(site: string): Promise<{ site: string; fermer(): Promise<void> }>
