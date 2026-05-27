-- Cover-artwork per aflevering. Wordt pas getoond nadat de bezoeker
-- heeft gestemd (anders verraadt de cover meteen welke titel de bron is).
ALTER TABLE poll_options ADD COLUMN artwork_url TEXT;
