const { environment } = require('@rails/webpacker');

["sass", "moduleSass"].forEach((loader) => {
      const sassLoader = environment.loaders
        .get(loader)
        .use.find((el) => el.loader === "sass-loader");
      sassLoader.options.implementation = require("sass");
});

module.exports = environment;
