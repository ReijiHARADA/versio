# スマートフォンで読むための EPUB 書き出し

Paper Reader は翻訳済み論文を EPUB 3 として保存できます。自前のサーバーや
スマートフォン用アプリは必要ありません。

## いちばん簡単な送り方（スマホで読む）

1. 「設定 → ライブラリとデータ → スマートフォン用 EPUB 同期」で、iCloud Drive
   または Google Drive の既存フォルダを選ぶ。
2. ライブラリの論文行右側にある「スマホで読む」（スマートフォンアイコン＋ラベル）を
   押す。お気に入り（スター）とは別操作で、スターはタイトル左にあります。
3. 初回で同期先が未設定のときはトーストから「設定を開く」で誘導されます。
4. 同期先フォルダへ EPUB がコピーされると、OS の Drive クライアントがクラウドへ
   同期します。
5. iPhone / iPad ではそのファイルを Apple Books で開く。Kindle では Send to Kindle
   など通常の受け渡しで送る。

一度送った論文はライブラリ上で「保存済み」と表示されます。再度押すと同じ
ファイル名を安全に置き換えます。送信中・失敗は行上のラベルとトーストで分かります。

## 明示的な書き出し

1. Reader の右上から「書き出す」を開き、「EPUB（Apple Books / Kindle）」を選ぶ。
2. 翻訳失敗箇所を除外する場合はチェックを付けず、原文を残したい場合だけ
   「翻訳失敗箇所を含める」を選ぶ。
3. macOS の保存先を選ぶ。同期先フォルダが設定済みなら、「保存後に同期先フォルダへ
   コピー」も選べる。
4. iPhone / iPad では AirDrop または iCloud Drive 経由で Apple Books に開く。
   Kindle では EPUB を Send to Kindle の通常の受け渡し方法で送る。

Apple の Books は Mac から EPUB を読み込めます（[Apple Support](https://support.apple.com/en-ie/guide/books/ibkseed72068/mac)）。
Kindle は Send to Kindle で EPUB を受け付けます（[Amazon Help](https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA)）。

フォルダ単位の一括書き出し（ZIP 内の複数 EPUB）では同期先コピーは使いません。
OAuth、クラウド API への接続、Paper Reader 内の原本削除は行いません。

EPUB の内容は現行の Paper Package を元に生成され、タイトル、著者、見出し、目次、
画像、表、数式、脚注、参考文献を XHTML として収録します。Apple Books / Kindle の
実機表示は端末やアプリのバージョンで変わるため、配布前に代表的な論文を一度確認して
ください。
