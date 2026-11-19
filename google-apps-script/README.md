# Webhook da planilha

O arquivo `Code.gs` atende os leads e o cache persistente de mobilidade no mesmo Web App.

Depois de atualizar o código no Google Apps Script:

1. crie uma nova versão do deployment do Web App;
2. mantenha a propriedade `WEBHOOK_TOKEN` igual a `GOOGLE_SHEETS_WEBHOOK_TOKEN` na Vercel;
3. confirme que a URL publicada continua em `GOOGLE_SHEETS_WEBHOOK_URL`;
4. faça um teste de lead e um cálculo de rota.

Na aba `Leads`, as duas últimas colunas registram a quantidade e os IDs dos imóveis compatíveis. Na aba `Mobilidade`, as colunas adicionadas registram o ID estável do par de coordenadas e as durações a pé e de carro. O script mantém compatibilidade com as chaves antigas baseadas em endereço.

A aba `Interesses` é criada automaticamente no primeiro clique em “Quero ver!”. Cada linha relaciona nome, WhatsApp, imóvel, hospital escolhido e atribuição da campanha.
