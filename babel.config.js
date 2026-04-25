module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Inject allowFontScaling={false} and maxFontSizeMultiplier={1} on every
      // <Text> and <TextInput> element at compile time, so system font size
      // settings never affect the app layout regardless of RN/React version.
      function ({ types: t }) {
        return {
          visitor: {
            JSXOpeningElement(path) {
              const elementName = path.node.name;
              const name = t.isJSXIdentifier(elementName)
                ? elementName.name
                : t.isJSXMemberExpression(elementName)
                ? elementName.property.name
                : null;

              if (name !== 'Text' && name !== 'TextInput') return;

              const attrs = path.node.attributes;
              const has = (propName) =>
                attrs.some(
                  (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === propName
                );

              if (!has('allowFontScaling')) {
                attrs.push(
                  t.jsxAttribute(
                    t.jsxIdentifier('allowFontScaling'),
                    t.jsxExpressionContainer(t.booleanLiteral(false))
                  )
                );
              }
              if (!has('maxFontSizeMultiplier')) {
                attrs.push(
                  t.jsxAttribute(
                    t.jsxIdentifier('maxFontSizeMultiplier'),
                    t.jsxExpressionContainer(t.numericLiteral(1))
                  )
                );
              }
            },
          },
        };
      },
    ],
  };
};
