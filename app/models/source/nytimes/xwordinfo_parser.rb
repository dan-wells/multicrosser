class Source::Nytimes::XwordinfoParser
  class Error < StandardError; end
  class MalformedPage < Error; end
  class LoginRequired < Error; end

  TITLE = Source::Nytimes::Parser::TITLE

  def self.parse(raw, syn_date:, orig_date:, subtitle: nil)
    new(raw, syn_date: syn_date, orig_date: orig_date, subtitle: subtitle).parse
  end

  def initialize(raw, syn_date:, orig_date:, subtitle: nil)
    @raw = raw.to_s
    @syn_date = syn_date
    @orig_date = orig_date
    @subtitle = subtitle
  end

  def parse
    raise LoginRequired, 'page is the login redirect' if login_redirect?

    doc = Nokogiri::HTML(@raw)
    table = doc.at_css('table#PuzTable')
    raise MalformedPage, 'no #PuzTable in document' unless table

    grid = parse_grid(table)
    rows = grid.size
    cols = grid.first.size

    across_clues = parse_clues(doc, '#ACluesPan')
    down_clues = parse_clues(doc, '#DCluesPan')

    setter, editor = parse_credits(doc)

    entries, cell_styles = Source::Nytimes::EntryBuilder.call(grid, across_clues, down_clues, error_class: MalformedPage)

    {
      'id' => "crossword/nytimes/#{@syn_date.strftime('%y%m%d')}",
      'name' => TITLE,
      'subtitle' => @subtitle,
      'date' => @syn_date.to_time(:utc).to_i * 1000,
      'creator' => {
        'name' => "#{setter} / #{editor}",
      },
      'dimensions' => { 'rows' => rows, 'cols' => cols },
      'entries' => entries,
      'cellStyles' => cell_styles,
      'originalDate' => @orig_date.iso8601,
      'syndicationDate' => @syn_date.to_time(:utc).iso8601,
      'solutionAvailable' => true,
    }
  end

  private

  # The login page is a small ASP.NET form, ~7 KB; the puzzle page is ~40 KB
  # with a #PuzTable. Either signal alone is good enough to detect the wall.
  def login_redirect?
    @raw.include?('/Account/Login.aspx') && !@raw.include?('id="PuzTable"')
  end

  def parse_grid(table)
    rows = table.css('tr').map do |tr|
      tr.css('td').map { |td| parse_cell(td) }
    end
    raise MalformedPage, 'empty grid' if rows.empty? || rows.first.empty?
    widths = rows.map(&:size).uniq
    raise MalformedPage, "ragged grid widths: #{widths.inspect}" if widths.size != 1
    rows
  end

  def parse_cell(td)
    classes = td['class'].to_s.split
    return { type: :black } if classes.include?('black')

    letter_node = td.at_css('div.letter')
    letter = letter_node&.text.to_s
    raise MalformedPage, 'non-black cell with no letter' if letter.empty?
    raise MalformedPage, "multi-char cell (rebus?): #{letter.inspect}" if letter.length > 1

    style = if classes.include?('bigcircle') then :circled
            elsif classes.include?('shade') then :shaded
            end
    { type: :cell, letter: letter, style: style }
  end

  # xwordinfo's clue panes contain a header div followed by a `.numclue` div
  # whose direct children alternate: number, clue-and-answer, number, ...
  def parse_clues(doc, pane_selector)
    numclue = doc.at_css("#{pane_selector} .numclue")
    raise MalformedPage, "no #{pane_selector} .numclue" unless numclue

    children = numclue.element_children
    raise MalformedPage, "#{pane_selector} numclue child count is odd" if children.size.odd?

    children.each_slice(2).map do |num_node, clue_node|
      _number = num_node.text.strip
      # clue_node looks like:  "Some clue : <a href='/Finder?w=ANSWER'>ANSWER</a>"
      # We strip the trailing " : ANSWER" so the user only sees the clue.
      anchor = clue_node.at_css('a')
      raise MalformedPage, "clue without answer anchor: #{clue_node.text.inspect}" unless anchor

      clue_text = clue_node.text.strip
      answer = anchor.text.strip
      # Trim "... : ANSWER" off the tail. Be defensive against unicode spacing.
      clue_text = clue_text.sub(/\s*:\s*#{Regexp.escape(answer)}\z/, '')
      clue_text
    end
  end

  def parse_credits(doc)
    labels = doc.css('div').select { |d| %w[Author: Editor:].include?(d.text.strip) }
    setter = labels.find { |d| d.text.strip == 'Author:' }&.next_element&.text&.strip
    editor = labels.find { |d| d.text.strip == 'Editor:' }&.next_element&.text&.strip
    raise MalformedPage, 'missing author/editor metadata' if setter.to_s.empty? || editor.to_s.empty?
    [setter, editor]
  end

end
