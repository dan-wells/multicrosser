CFLAGS ?= -O2 -Wall -Wextra

nonogen: nonogen.c
	$(CC) $(CFLAGS) -o $@ $< -lm

.PHONY: clean
clean:
	rm -f nonogen
