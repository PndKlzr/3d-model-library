# Backup e recuperação dos dados da biblioteca

## O que fica salvo

Cada biblioteca possui uma pasta oculta `.3d-model-library`. O arquivo
`3D_LIBRARY_DATA_DO_NOT_DELETE.json` é a fonte durável de:

- tags e lista de tags;
- notas e favoritos;
- histórico recente de abertura em slicers;
- identidade portátil da biblioteca.

Os caminhos salvos são relativos à raiz da biblioteca. O arquivo pode acompanhar a pasta para outro
computador sem carregar o nome de usuário ou o caminho absoluto antigo.

O arquivo `LIBRARY_INDEX_DO_NOT_DELETE.json` é somente um catálogo para acelerar a abertura. Ele pode
ser reconstruído a partir dos arquivos reais sem apagar tags, notas ou favoritos. As miniaturas ficam
no cache local do aplicativo e também podem ser recriadas.

## Backup manual

Abra **Configurações > Dados e manutenção** e escolha **Exportar backup**. O JSON exportado contém os
dados duráveis, mas não contém STL, 3MF, OBJ, imagens, arquivos compactados, miniaturas, executáveis de
slicer, preferências globais ou caminhos absolutos do Windows.

Para uma cópia completa, preserve também os arquivos de modelo e a pasta `.3d-model-library` junto da
biblioteca.

## Restauração

1. Abra a biblioteca de destino no aplicativo.
2. Acesse **Configurações > Dados e manutenção > Restaurar backup**.
3. Confira data, quantidade de modelos e tags mostradas na confirmação.
4. Confirme a restauração.

Se o backup veio de outra cópia da biblioteca, os caminhos relativos são aplicados à biblioteca ativa.
Itens que não existem mais aparecem na verificação de saúde e podem ser corrigidos sem alterar os
arquivos reais.

Antes de substituir os dados, o aplicativo grava
`3D_LIBRARY_DATA_RECOVERY_<data>.json` em `.3d-model-library` e mantém as cinco recuperações mais
recentes. A gravação principal é atômica: uma falha de escrita não deve deixar um arquivo parcial como
fonte ativa.

## O que cada ação faz

| Ação | Resultado | Arquivos de modelo |
| --- | --- | --- |
| Verificar biblioteca | Relê arquivos e integrações sem trocar o catálogo visível | Não altera |
| Reconstruir índice | Recria somente o catálogo descartável | Não altera |
| Limpar miniaturas antigas | Remove cache obsoleto pertencente à biblioteca ativa | Não altera |
| Abrir pasta de dados | Mostra `.3d-model-library` no Explorer | Não altera |
| Restaurar backup | Substitui tags, notas, favoritos e histórico após criar recuperação | Não altera |

A limpeza de miniaturas preserva caches de outras bibliotecas e entradas antigas cuja propriedade não
pode ser comprovada. Miniaturas válidas continuam disponíveis; uma miniatura removida pode ser gerada
novamente quando o modelo aparecer na tela.

## Recuperação manual

Se o catálogo estiver incorreto, use primeiro **Reconstruir índice**. Não apague
`3D_LIBRARY_DATA_DO_NOT_DELETE.json` para corrigir problemas visuais.

Se uma restauração trouxe dados errados, escolha uma das cópias
`3D_LIBRARY_DATA_RECOVERY_<data>.json` usando **Restaurar backup**. O arquivo `.bak` é uma cópia do
último estado válido criada durante gravações normais; as cópias `RECOVERY` são os pontos criados antes
de restaurações manuais.

Se a pasta estiver sem permissão de escrita, o aplicativo mantém a navegação disponível, mas bloqueia
alterações duráveis e a restauração até a permissão ser corrigida.

## Limites desta versão

O aplicativo ainda não possui instalador assinado, atualização automática ou configuração final de
fuses do Electron. Essas proteções pertencem à futura etapa de empacotamento e não mudam o formato do
backup portátil.
