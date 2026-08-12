// node --test --import ./test/setup.mjs で先読みされる。
// db.js が読み込まれる前に環境変数をセットし、実データ(glank.sqlite)を一切使わせない。
process.env.GLANK_DB_PATH = ':memory:'
