module PageHelper
  def series_picker_data(name, meta, latest)
    {
      'display-name': Series.display_name(name),
      'first-puzzle': meta[:first_puzzle],
      'last-puzzle': latest || meta[:last_puzzle],
      days: meta[:days]&.to_a&.join(','),
    }
  end
end
