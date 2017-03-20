browserified:
	browserify main.js >bundle.js

minified: browserified
	minify bundle.js

dev: browserified

production: minified

all: production
