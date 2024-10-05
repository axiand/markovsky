# markovsky
Toolkit for setting up a bluesky bot that posts automatically from a markov chain

## Guide
Markovsky comes in the form of a handful of scripts that you run in order to perform tasks with the bot.

Markovsky is tested with Node.js version 22.8.0, I cannot guarantee that anything else will work properly. Runtimes that are not compatible with Node libraries will crash.

1. `git clone` this repository.
- Run `pnpm i` to install packages - this project is mostly dependencyless so it should only take a second
2. Point your terminal at the newly cloned directory (note: you must always do this before running any scripts)
3. To gather the dataset: `node gather.js`
- Press Ctrl+C to stop execution once you're satisfied with the dataset size.
- See the configuring section to learn how to tune the dataset filters.
- This will overwrite any data in the existing `corpus.txt` file! If you want to keep a previous version, rename it.
4. Then, to train the model: `node train.js`
- Give the model some time to train. It should be fairly quick assuming your dataset is a reasonable size.
- You'll see an output of sample strings once training is finished.
5. It's recommended that you test your model by running: `node output.js`. This is not required, but will let you see what kind of output your model is giving before you go ahead with uploading.
6. To run the model and upload the result to Bluesky: `node upload.mjs`
- This requires credentials. See the configuring section.
- As of Node version 20+, support for env files is available. To use an env file, `node --env-file=<path> upload.mjs`
- This script only makes one post. For automated posting, set up a [cron job](https://en.wikipedia.org/wiki/Cron) to run the script at intervals.

## Configuring

### Scraper config
Scraper config is located in the `cfg.json` file. Notable values are:
- `AllowedLangs` is a list of languages which are allowed to be included in the dataset
- `StrictLang` is the same, but only one language
- `StrictLangMode` controls strict language filtering. If it is false, `AllowedLangs` is used instead
- `BackDays` is how far back the firehose cursor should be set in days. Setting a firehose cursor in the past is helpful as it will fetch many older posts as quickly as your network/processor can handle
- `MinLength` controls how long posts need to be to be included in the dataset. Excluding very short posts may help reduce garbage in the final model.
- `Separator` controls the separator in the dataset file. I strongly discourage messing with this as it may break things

### Bluesky config
Markovsky pulls your credentials from two environment variables:
- `MARKOVSKY_LOGIN` is your username/email
- `MARKOVSKY_PWD` is your password

Once you've published at least once, your credentials are cached at `/data/authState.json` - **DO NOT upload or share this file anywhere - it includes your Bluesky token, which grants full access to your account.** If you get errors about an invalid token or want to point markov at a different account, delete this file.

## FAQ

### Q: Is this AI? I don't like AI.
No, it's a [Markov chain](https://en.wikipedia.org/wiki/Markov_chain). Calling a markov chain AI would be like calling a spool of string a carpet.

### Q: I have concerns about scraping.
Markovsky discards any metadata about posts other than the text content. The dataset does not store any data that could be used to identify you as the author of any particular post. It's worth noting that the nature of the AT Protocol means all of your posts are public.

### Q: Will it support multiple models?
Maybe! Right now the only valid model name is `model`, but you could probably plug-and-play models with some file renaming shenanigans.

### Q: Can I fork this and make it a markov bot for something else?
Yes. The only thing that really makes this a "bluesky markov bot" rather than a generic one is the gathering and uploading process - there's nothing saying you can't modify the gather/upload script to pull/push to some other service. If you want to make that a reality, feel free to fork.

### Q: What kind of memory usage should I expect?
From my testing - with a dataset of 14MB of text, the model consumes about 500MB of memory. Your personal experience may vary.

### Q: Why is my model bigger than the corpus?
I'm bad at programming.