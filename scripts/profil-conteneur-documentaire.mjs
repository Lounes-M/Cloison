export function profilConteneur(image, nom) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image) || !/^cloison-document-[a-f0-9-]{36}$/.test(nom))
    throw new Error('Image ou nom de conteneur invalide')
  return [
    'create',
    '--name',
    nom,
    '--label',
    'cloison.documentaire=reference',
    '--interactive',
    '--pull=never',
    '--network=none',
    '--ipc=none',
    '--cgroupns=private',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges=true',
    '--user=65532:65532',
    '--memory=384m',
    '--memory-swap=384m',
    '--cpus=1',
    '--pids-limit=64',
    '--ulimit=core=0:0',
    '--ulimit=nofile=64:64',
    '--log-driver=none',
    image,
  ]
}
