/* formatos/texto.js — arquivo de texto (.txt): o texto pronto, sem OCR */
Leitura.formatos.texto = async arquivo => [{ texto: (await Leitura.textoDoArquivo(arquivo)).replace(/^﻿/, '') }];
